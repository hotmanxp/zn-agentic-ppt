// @ts-ignore vendor bundle — no types available
import { tool, createSdkMcpServer } from '../../../../vendor/sdk.mjs'
import { randomUUID } from 'node:crypto'
import { GenerationRunner } from '../runner.js'
import { renderPrompt } from '../prompts/index.js'
import { extractFirstJsonValue } from '../json-extract.js'
import { validateBrief } from '../../../shared/brief.js'
import type { Settings, ProjectBrief, AppError } from '../../../shared/types.js'

export interface AskUserRequest {
  qid: string
  turn: 1 | 2
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description?: string }>
    multiSelect: boolean
  }>
}

export type AskAnswer =
  | { cancelled: false; value: Record<string, string | string[]> }
  | { cancelled: true; reason?: 'user_cancelled' | 'max_turns' }

const askUserQuestionJsonSchema = {
  type: 'object',
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        required: ['question', 'header', 'options', 'multiSelect'],
        properties: {
          question: { type: 'string' },
          header: { type: 'string', maxLength: 12 },
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            items: {
              type: 'object',
              required: ['label'],
              properties: {
                label: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
          multiSelect: { type: 'boolean' },
        },
      },
    },
  },
}

export interface BriefAgentOpts {
  cwd: string
  settings: Settings
  source: string
  hint: ProjectBrief | null
  onQuestion: (q: AskUserRequest) => void
  onDone: (b: ProjectBrief) => void
  onError: (e: AppError) => void
  /** Test-only: inject canned events. When set, run() does not call real SDK. */
  sdkEvents?: any[]
}

export class BriefAgent {
  private askQueue = new Map<string, (r: AskAnswer) => void>()
  private turns = 0
  private runner: GenerationRunner | null = null
  private askHandler: ((args: any) => Promise<{ content: Array<{ type: string; text: string }> }>) | null = null

  constructor(private opts: BriefAgentOpts) {}

  /** Test-only accessor for the AskUserQuestion tool handler. */
  __getAskHandler() {
    if (!this.askHandler) {
      this.askHandler = this.buildAskHandler()
    }
    return this.askHandler
  }

  private buildAskHandler() {
    return async (args: any): Promise<{ content: Array<{ type: string; text: string }> }> => {
      if (this.turns >= 2) {
        return { content: [{ type: 'text', text: JSON.stringify({ cancelled: true, reason: 'max_turns' }) }] }
      }
      this.turns++
      const qid = randomUUID()
      const answer = await new Promise<AskAnswer>((resolve) => {
        this.askQueue.set(qid, resolve)
        this.opts.onQuestion({ qid, turn: this.turns as 1 | 2, questions: args.questions })
      })
      return { content: [{ type: 'text', text: JSON.stringify(answer) }] }
    }
  }

  async run(): Promise<void> {
    const askHandler = this.buildAskHandler()
    this.askHandler = askHandler
    const askUserQuestionTool = tool(
      'AskUserQuestion',
      'Ask the user 1-4 multiple-choice questions to fill missing information.',
      askUserQuestionJsonSchema as any,
      askHandler as any,
    )
    const server = createSdkMcpServer({
      type: 'sdk',
      name: 'brief-tools',
      tools: [askUserQuestionTool],
    })

    const systemPrompt = await renderPrompt('BRIEF_OPTIMIZE_PROMPT', {
      source: this.opts.source,
      hintJson: JSON.stringify(this.opts.hint ?? {}, null, 2),
    })

    this.runner = new GenerationRunner({
      cwd: this.opts.cwd,
      topic: '',
      outline: '',
      settings: this.opts.settings,
      runId: `brief:${randomUUID()}`,
      systemPrompt,
      userMessage: '请开始整理项目信息。',
      mcpServers: { 'brief-tools': server },
      sdkEvents: this.opts.sdkEvents,
      onEvent: () => {},
      onProgress: () => {},
      onDone: ({ html }) => this.handleDone(html),
      onError: ({ error }) => this.opts.onError({ code: 'INTERNAL', message: error.message, retryable: false }),
    })
    await this.runner.run()
  }

  cancel(): void { this.runner?.interrupt() }

  answer(qid: string, value: AskAnswer): void {
    const resolve = this.askQueue.get(qid)
    if (resolve) { this.askQueue.delete(qid); resolve(value) }
  }

  private handleDone(buffer: string): void {
    try {
      const obj = extractFirstJsonValue(buffer)
      this.opts.onDone(validateBrief(obj))
    } catch (e: any) {
      this.opts.onError({ code: 'PARSE', message: e?.message ?? String(e), retryable: true })
    }
  }
}
