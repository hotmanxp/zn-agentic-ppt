// @ts-ignore vendor bundle — no types available
import { registerExternalTool } from '../../../../vendor/sdk.mjs'
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
  static readonly MAX_PARSE_RETRIES = 1
  private parseRetries = 0

  private askQueue = new Map<string, (r: AskAnswer) => void>()
  private turns = 0
  private runner: GenerationRunner | null = null
  private unregisterTool: (() => void) | null = null

  constructor(private opts: BriefAgentOpts) {}

  /**
   * Test-only: directly invoke the ask flow without going through the SDK.
   * Returns a Promise that resolves with the answer the SDK would have
   * gotten. Used by the unit tests to drive the ask flow synchronously.
   */
  __invokeAskHandlerForTest = async (args: any): Promise<AskAnswer> => {
    if (this.turns >= 2) {
      return { cancelled: true, reason: 'max_turns' }
    }
    this.turns++
    const qid = randomUUID()
    return new Promise<AskAnswer>((resolve) => {
      this.askQueue.set(qid, resolve)
      this.opts.onQuestion({ qid, turn: this.turns as 1 | 2, questions: args.questions })
    })
  }

  async run(): Promise<void> {
    this.parseRetries = 0
    await this.runOnce('', '')
  }

  cancel(): void { this.runner?.interrupt() }

  answer(qid: string, value: AskAnswer): void {
    const resolve = this.askQueue.get(qid)
    if (resolve) { this.askQueue.delete(qid); resolve(value) }
  }

  private async runOnce(retryHint: string, _prevBuffer: string): Promise<void> {
    const systemPrompt = await renderPrompt('BRIEF_OPTIMIZE_PROMPT', {
      source: this.opts.source,
      hintJson: JSON.stringify(this.opts.hint ?? {}, null, 2),
      retryContext: retryHint,
    })
    void _prevBuffer

    // Register AskUserQuestion as a SYSTEM TOOL via vendor SDK's
    // registerExternalTool. Same dispatch path as Read/Write/Bash; the
    // MCP tool path stalls when the handler awaits a Promise, so we
    // avoid it. Tool name is 'AskUserQuestion' (matches SDK convention).
    const askUserQuestionTool: any = {
      name: 'AskUserQuestion',
      searchHint: 'prompt the user with a multiple-choice question',
      // Provide BOTH a Zod-like `inputSchema` (SDK calls .safeParse /
      // .parse / .isUnitSchema / .getMemberSchemas) and a plain JSON
      // `inputJSONSchema` (other SDK paths). We avoid pulling zod in as
      // a dependency by mocking the four Zod methods to pass through;
      // since we control the call() input (it's an object literal from
      // us), safeParse just accepts whatever we get.
      inputSchema: {
        ...askUserQuestionJsonSchema,
        safeParse: (input: any) => ({ success: true, data: input }),
        parse: (input: any) => input,
        isUnitSchema: () => false,
        getMemberSchemas: () => ({}),
      },
      inputJSONSchema: askUserQuestionJsonSchema,
      isEnabled: () => true,
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      isDestructive: () => false,
      isOpenWorld: () => false,
      async description(_input: any, _options: any) {
        return 'Ask the user 1-4 multiple-choice questions to fill missing information. Use this when source or hint is missing critical fields (audience, durationMinutes, style, etc.) and you cannot infer them reliably.'
      },
      async prompt(_options: any) {
        return 'AskUserQuestion: emit when critical info is missing. Max 2 turns; max 4 questions per turn; 2-4 options per question; header ≤ 12 chars.'
      },
      userFacingName: () => 'AskUserQuestion',
      toAutoClassifierInput: (input: any) =>
        (input?.questions ?? []).map((q: any) => q.question).join(' | '),
      async call(
        args: { questions: any[] },
        _context: unknown,
        _canUseTool: unknown,
        _parentMessage: unknown,
        _onProgress?: unknown,
      ) {
        const questions = args?.questions ?? []
        if (this.turns >= 2) {
          return { data: { cancelled: true, reason: 'max_turns' } }
        }
        this.turns++
        const qid = randomUUID()
        const answer = await new Promise<AskAnswer>((resolve) => {
          this.askQueue.set(qid, resolve)
          this.opts.onQuestion({ qid, turn: this.turns as 1 | 2, questions })
        })
        return { data: answer }
      },
      mapToolResultToToolResultBlockParam(result: any, _toolUseID: string) {
        if (result?.cancelled) {
          return {
            type: 'tool_result',
            content: `User declined to answer the question.`,
            tool_use_id: _toolUseID,
          }
        }
        const value = result?.value ?? {}
        const lines = Object.entries(value).map(
          ([q, a]) => `"${q}"="${Array.isArray(a) ? a.join(', ') : a}"`,
        )
        return {
          type: 'tool_result',
          content: `User answered: ${lines.join('; ')}`,
          tool_use_id: _toolUseID,
        }
      },
    }

    this.unregisterTool = registerExternalTool(askUserQuestionTool)

    this.runner = new GenerationRunner({
      cwd: this.opts.cwd,
      topic: '',
      outline: '',
      settings: this.opts.settings,
      runId: `brief:${randomUUID()}`,
      systemPrompt,
      userMessage: '请开始整理项目信息。',
      // No mcpServers — AskUserQuestion is now a system tool.
      // Disable built-in file tools so the LLM only uses our system tool
      // (otherwise the SDK's default code-agent profile lets the LLM
      // drift into Bash/Read/Write and emit final JSON without asking).
      disallowedTools: [
        'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
        'WebFetch', 'WebSearch',
      ],
      maxTurns: 10,
      sdkEvents: this.opts.sdkEvents,
      onEvent: () => {},
      onProgress: () => {},
      onDone: ({ html }) => this.handleDone(html),
      onError: ({ error }) => this.opts.onError({ code: 'INTERNAL', message: error.message, retryable: false }),
    })
    try {
      await this.runner.run()
    } finally {
      this.unregisterTool?.()
      this.unregisterTool = null
    }
  }

  private async handleDone(buffer: string): Promise<void> {
    try {
      const obj = extractFirstJsonValue(buffer)
      this.opts.onDone(validateBrief(obj))
    } catch (e: any) {
      if (this.parseRetries >= BriefAgent.MAX_PARSE_RETRIES) {
        this.opts.onError({ code: 'PARSE', message: e?.message ?? String(e), retryable: true })
        return
      }
      this.parseRetries++
      console.warn(`[BriefAgent] parse failed (${(e as Error).message}); retry ${this.parseRetries}/${BriefAgent.MAX_PARSE_RETRIES} with strict-JSON prompt`)
      try {
        const retryHint = `[RETRY] 上次输出无法解析为 JSON。请只输出纯 JSON object,不要 markdown fence,不要解释,不要 tool_use。`
        await this.runOnce(retryHint, buffer.slice(0, 2000))
      } catch {
        this.opts.onError({ code: 'PARSE', message: e?.message ?? String(e), retryable: true })
      }
    }
  }
}
