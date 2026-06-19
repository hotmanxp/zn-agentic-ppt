// @ts-ignore vendor bundle — no types available
import { query as sdkQuery } from '../../../vendor/sdk.mjs'
import { buildSystemPrompt } from './prompts.js'
import type { Settings } from '../../shared/types.js'

export interface RunnerOptions {
  cwd: string
  topic: string
  outline: string
  settings: Settings
  runId: string
  /** Test-only: provide canned events instead of calling real SDK */
  sdkEvents?: any[]
  onEvent: (msg: any) => void
  onProgress: (info: { phase: string; current: number }) => void
  onDone: (info: { html: string; durationMs: number }) => void
  onError: (info: { error: { code: string; message: string; retryable: boolean } }) => void
}

const PROGRESS_EVERY = 200

export class GenerationRunner {
  private buffer = ''
  private resultType: string | null = null
  private durationMs = 0
  private query: any
  html: string | null = null

  constructor(private opts: RunnerOptions) {
    // Initialize query so interrupt() works even before run() is called (test mode)
    if (opts.sdkEvents) {
      this.query = sdkQuery({ __events: opts.sdkEvents, prompt: '', options: {} })
    }
  }

  async run(): Promise<void> {
    if (this.opts.sdkEvents) {
      for (const ev of this.opts.sdkEvents) await this.handle(ev)
      this.finish()
      return
    }
    this.query = sdkQuery({
      prompt: 'Generate the PPT.',
      options: {
        cwd: this.opts.cwd,
        model: this.opts.settings.llm.model,
        systemPrompt: buildSystemPrompt(this.opts.topic, this.opts.outline),
        env: {
          ANTHROPIC_BASE_URL: this.opts.settings.llm.baseUrl,
          ANTHROPIC_AUTH_TOKEN: this.opts.settings.llm.apiKey,
        },
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        canUseTool: async () => ({ behavior: 'deny', message: 'tools disabled' }),
        maxTurns: 1,
      },
    })
    try {
      for await (const msg of this.query) {
        this.opts.onEvent(msg)
        await this.handle(msg)
      }
    } catch (err) {
      this.opts.onError({
        error: { code: 'INTERNAL', message: String(err), retryable: false },
      })
      return
    }
    this.finish()
  }

  private async handle(msg: any): Promise<void> {
    if (msg.type === 'assistant') {
      for (const block of msg.message?.content ?? []) {
        if (block.type === 'text') {
          this.buffer += block.text
          if (this.buffer.length % PROGRESS_EVERY < block.text.length) {
            this.opts.onProgress({ phase: 'streaming', current: this.buffer.length })
          }
        }
      }
    } else if (msg.type === 'result') {
      this.resultType = msg.subtype
      this.durationMs = msg.duration_ms ?? 0
    }
  }

  private finish(): void {
    if (this.resultType === 'success') {
      this.html = this.buffer
      this.opts.onDone({ html: this.buffer, durationMs: this.durationMs })
    } else {
      this.opts.onError({
        error: {
          code: 'INTERNAL',
          message: `Generation failed: ${this.resultType ?? 'unknown'}`,
          retryable: true,
        },
      })
    }
  }

  interrupt(): void {
    if (this.opts.sdkEvents) {
      // In test mode the mock's interrupt is captured via the opts.sdkEvents
      // array iteration closure — but to call it we need to reach into the
      // mock. Since we can't import test-only symbols into production code,
      // we set this.query to the mock-returned object during run().
      this.query?.interrupt()
      return
    }
    this.query?.interrupt()
  }
}
