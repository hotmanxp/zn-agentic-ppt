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
  private askQueue = new Map<string, (r: AskAnswer) => void>()
  private turns = 0
  private runner: GenerationRunner | null = null
  private unregisterTool: (() => void) | null = null

  constructor(private opts: BriefAgentOpts) {}

  /**
   * Test-only: directly invoke the tool's call() to drive the ask flow
   * without going through the SDK. Returns a Promise that resolves with
   * the answer the SDK would have gotten.
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
    await this.runOnce('', '')
  }

  private async runOnce(retryHint: string, prevBuffer: string): Promise<void> {
    const systemPrompt = await renderPrompt('BRIEF_OPTIMIZE_PROMPT', {
      source: this.opts.source,
      hintJson: JSON.stringify(this.opts.hint ?? {}, null, 2),
      retryContext: retryHint,
    })
    if (retryHint === '') void prevBuffer // unused on first attempt

    // Register our question-asking tool as a SYSTEM TOOL (not MCP tool).
    // Name is `BriefAskUser` to avoid collision with vendor SDK's
    // built-in `AskUserQuestion` stub — which would either be the only
    // one the LLM sees (if we name ours the same) or shadow our
    // registration. SDK's `registerExternalTool` exposes ours to the LLM
    // via getAllBaseTools() — same dispatch path as Read/Write/Bash — so
    // the tool-call loop doesn't stall when our handler awaits the IPC
    // roundtrip to the renderer.
    const askUserQuestionTool: any = {
      name: 'BriefAskUser',
      searchHint: 'prompt the user with a multiple-choice question',
      inputSchema: askUserQuestionJsonSchema,
      outputSchema: { type: 'object' },
      isEnabled: () => true,
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      async description() {
        return 'Ask the user 1-4 multiple-choice questions to fill missing information. Use this when source or hint is missing critical fields (audience, durationMinutes, style, etc.) and you cannot infer them reliably.'
      },
      async prompt(_context?: any) {
        return 'BriefAskUser: emit when critical info is missing. Max 2 turns; max 4 questions per turn; 2-4 options per question; header ≤ 12 chars.'
      },
      userFacingName: () => 'BriefAskUser',
      toAutoClassifierInput: (input: any) =>
        (input?.questions ?? []).map((q: any) => q.question).join(' | '),
      async call({ questions }: { questions: any[] }) {
        if (this.turns >= 2) {
          return { data: { cancelled: true, reason: 'max_turns' } }
        }
        this.turns++
        const qid = randomUUID()
        const answer = await new Promise<AskAnswer>((resolve) => {
          this.askQueue.set(qid, resolve)
          this.opts.onQuestion({ qid, turn: this.turns as 1 | 2, questions })
        })
        // SDK normalises tool result via mapToolResultToToolResultBlockParam
        // below; for the actual SDK execution path we just return data.
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
      userMessage: prevBuffer
        ? `上一次的输出无法解析为 JSON(包含 markdown fence 或多余文字)。请**只**输出**纯 JSON object**,第一个非空白字符必须是左花括号 {,最后以右花括号 } 结尾,不要任何解释。原始 prompt 见 system prompt。`
        : '请开始整理项目信息。',
      // No mcpServers — AskUserQuestion is now a system tool.
      // Disable all built-in file tools so the LLM only uses our
      // AskUserQuestion system tool (otherwise the SDK default
      // code-agent profile lets the LLM drift into Bash/Read/Write
      // and emit final JSON without ever asking).
      disallowedTools: [
        'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
        'WebFetch', 'WebSearch',
        // NOTE: do NOT add 'AskUserQuestion' here — that's the name of
        // our own tool registered via registerExternalTool. The SDK has
        // no built-in stub for it; listing it in disallowedTools would
        // hide OUR tool from the LLM.
      ],
      // Need ≥ 3 assistant turns: ask → answer → ask → answer → final JSON
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

  cancel(): void { this.runner?.interrupt() }

  answer(qid: string, value: AskAnswer): void {
    const resolve = this.askQueue.get(qid)
    if (resolve) { this.askQueue.delete(qid); resolve(value) }
  }

  private async handleDone(buffer: string): Promise<void> {
    try {
      const obj = extractFirstJsonValue(buffer)
      this.opts.onDone(validateBrief(obj))
    } catch (e: any) {
      // First-attempt parse failed — try once more with a stricter
      // "output only pure JSON" prompt. LLM output is often stochastic;
      // a retry usually lands in the right shape.
      console.warn(`[BriefAgent] parse failed (${(e as Error).message}); retrying with strict-JSON prompt`)
      try {
        const retryHint = `[RETRY] 上次输出无法解析为 JSON。请只输出纯 JSON object,不要 markdown fence,不要解释,不要 tool_use。`
        await this.runOnce(retryHint, buffer.slice(0, 2000))
      } catch (retryErr: any) {
        this.opts.onError({ code: 'PARSE', message: e?.message ?? String(e), retryable: true })
      }
    }
  }
}
