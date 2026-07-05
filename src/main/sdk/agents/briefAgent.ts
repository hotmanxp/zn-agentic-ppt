import { randomUUID } from "node:crypto";
// @ts-ignore vendor bundle — no types available
import { registerExternalTool } from "../../../../vendor/sdk.mjs";
import type { AppError, ProjectBrief, Settings } from "../../../shared/types.js";
import { renderPrompt } from "../prompts/index.js";
import { GenerationRunner } from "../runner.js";

export interface AskUserRequest {
  qid: string;
  turn: 1 | 2;
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description?: string }>;
    multiSelect: boolean;
  }>;
}

export type AskAnswer =
  | { cancelled: false; value: Record<string, string | string[]> }
  | { cancelled: true; reason?: "user_cancelled" | "max_turns" };

const askUserQuestionJsonSchema = {
  type: "object",
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        required: ["question", "header", "options", "multiSelect"],
        properties: {
          question: { type: "string" },
          header: { type: "string", maxLength: 12 },
          options: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            items: {
              type: "object",
              required: ["label"],
              properties: {
                label: { type: "string" },
                description: { type: "string" },
              },
            },
          },
          multiSelect: { type: "boolean" },
        },
      },
    },
  },
};

/** Match `<briefaskuser>{...json...}</briefaskuser>` (case-insensitive). */
export interface BriefAgentOpts {
  cwd: string;
  settings: Settings;
  source: string;
  hint: ProjectBrief | null;
  onQuestion: (q: AskUserRequest) => void;
  onDone: (result: ProjectBrief) => void;
  onError: (e: AppError) => void;
  /** Test-only: inject canned events. When set, run() does not call real SDK. */
  sdkEvents?: any[];
}

export class BriefAgent {
  private askQueue = new Map<string, (r: AskAnswer) => void>();
  private turns = 0;
  private unregisterTool: (() => void) | null = null;

  constructor(private opts: BriefAgentOpts) {}

  /**
   * Test-only: directly invoke the ask flow without going through the SDK.
   * Returns a Promise that resolves with the answer the SDK would have
   * gotten. Used by the unit tests to drive the ask flow synchronously.
   */
  __invokeAskHandlerForTest = async (args: any): Promise<AskAnswer> => {
    if (this.turns >= 2) {
      return { cancelled: true, reason: "max_turns" };
    }
    this.turns++;
    const qid = randomUUID();
    return new Promise<AskAnswer>((resolve) => {
      this.askQueue.set(qid, resolve);
      this.opts.onQuestion({
        qid,
        turn: this.turns as 1 | 2,
        questions: args.questions,
      });
    });
  };

  async run(): Promise<void> {
    try {
      this.registerAskUserTool();
      let lastAnswer: AskAnswer | null = null;
      let lastText = "";
      let sessionId: string | undefined;
      // Up to 3 SDK turns: initial + 2 answer-injected turns.
      for (let i = 0; i < 3; i++) {
        const turn = await this.runSdkTurn(lastAnswer, sessionId);
        lastText = turn.text;
        // Subsequent turns resume the prior session so the LLM sees the
        // full ask/answer history in its context window.
        sessionId = turn.sessionId ?? sessionId;
        const ask = parseAskUserBlock(lastText);
        if (!ask) {
          this.opts.onDone({ markdown: lastText.trim() });
          return;
        }
        if (this.turns >= 2) {
          // Already asked twice; inject cancelled so LLM proceeds to final.
          lastAnswer = { cancelled: true, reason: "max_turns" };
          continue;
        }
        this.turns++;
        const qid = randomUUID();
        lastAnswer = await new Promise<AskAnswer>((resolve) => {
          this.askQueue.set(qid, resolve);
          this.opts.onQuestion({
            qid,
            turn: this.turns as 1 | 2,
            questions: ask.questions,
          });
        });
      }
      // Hit the 3-turn cap without a clean final output — emit whatever we have.
      this.opts.onDone({ markdown: lastText.trim() });
    } catch (e: any) {
      this.opts.onError({
        code: "INTERNAL",
        message: e?.message ?? String(e),
        retryable: false,
      });
    } finally {
      this.unregisterTool?.();
      this.unregisterTool = null;
    }
  }

  cancel(): void {
    // Best-effort: a pending answer should resolve as cancelled so we
    // don't hang waiting on the user.
    for (const [qid, resolve] of this.askQueue) {
      resolve({ cancelled: true, reason: "user_cancelled" });
      this.askQueue.delete(qid);
    }
  }

  answer(qid: string, value: AskAnswer): void {
    const resolve = this.askQueue.get(qid);
    if (resolve) {
      this.askQueue.delete(qid);
      resolve(value);
    }
  }

  private registerAskUserTool(): void {
    // Register AskUserQuestion as a SYSTEM TOOL via vendor SDK's
    // registerExternalTool. Same dispatch path as Read/Write/Bash; the
    // MCP tool path stalls when the handler awaits a Promise, so we
    // avoid it. Tool name is 'BriefAskUser' to avoid colliding with
    // SDK's built-in stub.
    const askUserQuestionTool: any = {
      name: "BriefAskUser",
      searchHint: "prompt the user with a multiple-choice question",
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
        return "Ask the user 1-4 multiple-choice questions to fill missing information. Use this when source or hint is missing critical fields (audience, durationMinutes, style, etc.) and you cannot infer them reliably.";
      },
      async prompt(_options: any) {
        return "BriefAskUser: emit when critical info is missing. Max 2 turns; max 4 questions per turn; 2-4 options per question; header ≤ 12 chars.";
      },
      userFacingName: () => "BriefAskUser",
      toAutoClassifierInput: (input: any) =>
        (input?.questions ?? []).map((q: any) => q.question).join(" | "),
      async call(
        args: { questions: any[] },
        _context: unknown,
        _canUseTool: unknown,
        _parentMessage: unknown,
        _onProgress?: unknown,
      ) {
        const questions = args?.questions ?? [];
        if (this.turns >= 2) {
          return { data: { cancelled: true, reason: "max_turns" } };
        }
        this.turns++;
        const qid = randomUUID();
        const answer = await new Promise<AskAnswer>((resolve) => {
          this.askQueue.set(qid, resolve);
          this.opts.onQuestion({ qid, turn: this.turns as 1 | 2, questions });
        });
        return { data: answer };
      },
      mapToolResultToToolResultBlockParam(result: any, _toolUseID: string) {
        if (result?.cancelled) {
          return {
            type: "tool_result",
            content: `User declined to answer the question.`,
            tool_use_id: _toolUseID,
          };
        }
        const value = result?.value ?? {};
        const lines = Object.entries(value).map(
          ([q, a]) => `"${q}"="${Array.isArray(a) ? a.join(", ") : a}"`,
        );
        return {
          type: "tool_result",
          content: `User answered: ${lines.join("; ")}`,
          tool_use_id: _toolUseID,
        };
      },
    };

    this.unregisterTool = registerExternalTool(askUserQuestionTool);
  }

  /**
   * Run a single SDK turn. `previousAnswer` is injected into the user
   * message so the LLM sees the prior round's answers. `resumeSessionId`
   * resumes the prior session so the LLM's full ask/answer history stays
   * in context.
   */
  private async runSdkTurn(
    previousAnswer: AskAnswer | null,
    resumeSessionId: string | undefined,
  ): Promise<{ text: string; sessionId?: string }> {
    const systemPrompt = await renderPrompt("BRIEF_OPTIMIZE_PROMPT", {
      source: this.opts.source,
      hintJson: JSON.stringify(this.opts.hint ?? {}, null, 2),
    });
    const userMessage = previousAnswer
      ? previousAnswer.cancelled
        ? `用户跳过了上轮提问。请基于已有信息直接输出最终 markdown 项目信息,不要再追问。`
        : `上轮你问了用户问题。用户回答: ${JSON.stringify(previousAnswer.value)}。请继续整理项目信息并输出最终 markdown,不要再追问。`
      : '请开始整理项目信息。如果需要追问,**只输出一个 JSON object**:{"questions":[...]}。如果信息够用,直接输出最终 markdown 项目信息。';

    return new Promise<{ text: string; sessionId?: string }>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };
      const runner = new GenerationRunner({
        cwd: this.opts.cwd,
        topic: "",
        outline: "",
        settings: this.opts.settings,
        runId: `brief:${randomUUID()}`,
        systemPrompt,
        userMessage,
        // First turn: fresh session. Subsequent turns: continue same session.
        ...(resumeSessionId ? { resumeSessionId } : {}),
        disallowedTools: [
          "Bash",
          "Read",
          "Write",
          "Edit",
          "Glob",
          "Grep",
          "AskUserQuestion",
          "WebFetch",
          "WebSearch",
        ],
        maxTurns: 10,
        sdkEvents: this.opts.sdkEvents,
        onEvent: () => {},
        onProgress: () => {},
        onDone: ({ html, sessionId }) => settle(() => resolve({ text: html, sessionId })),
        onError: ({ error }) => settle(() => reject(new Error(error.message))),
      });
      void runner.run();
    });
  }
}

/**
 * Try to extract an AskUser block from the LLM's text. Several shapes
 * are accepted (the LLM emits different formats across runs):
 *
 *   1. `<briefaskuser>{ "questions": [...] }</briefaskuser>` — bare JSON object
 *   2. `<briefaskuser><questions>[...]</questions></briefaskuser>` — XML-wrapped array
 *   3. `<briefaskuser>[...]</briefaskuser>` — bare JSON array
 *   4. `<briefaskuser><question>{...}</question>...</briefaskuser>` — XML-wrapped objects
 *
 * Returns null if no parseable questions array is found.
 */
export function parseAskUserBlock(text: string): { questions: AskUserRequest["questions"] } | null {
  // Strategy A: XML-wrapped `<briefaskuser>...</briefaskuser>` (any inner shape)
  const m =
    text.match(/<briefaskuser>\s*([\s\S]*?)\s*<\/briefaskuser>/i) ??
    text.match(/<BriefAskUser>\s*([\s\S]*?)\s*<\/BriefAskUser>/i);
  if (m) {
    const inner = m[1].trim();
    if (inner) {
      // inner is itself valid JSON (object or array)
      try {
        const parsed = JSON.parse(inner);
        if (Array.isArray(parsed)) return { questions: parsed };
        if (Array.isArray(parsed?.questions)) return { questions: parsed.questions };
      } catch {
        /* not bare JSON — try XML sub-wrappers */
      }
      // XML-wrapped `<questions>[...]</questions>`
      const qMatch = inner.match(/<questions>\s*([\s\S]*?)\s*<\/questions>/i);
      if (qMatch) {
        try {
          const arr = JSON.parse(qMatch[1]);
          if (Array.isArray(arr)) return { questions: arr };
        } catch {
          /* fall through */
        }
      }
      // XML-wrapped `<question>{...}</question>` × N
      const singleQs = [...inner.matchAll(/<question>\s*([\s\S]*?)\s*<\/question>/gi)];
      if (singleQs.length > 0) {
        const questions = [];
        for (const q of singleQs) {
          try {
            questions.push(JSON.parse(q[1]));
          } catch {
            return null;
          }
        }
        return { questions };
      }
    }
  }

  // Strategy B: bare JSON object with `questions` field, no XML wrapper.
  // The LLM is instructed to emit ONLY this object (no prose) when asking;
  // we scan from the `{"questions"` anchor and use a depth counter to find
  // the matching closing brace, ignoring braces inside string values.
  const anchor = text.search(/\{\s*"questions"/);
  if (anchor >= 0) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let endIdx = -1;
    for (let i = anchor; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    if (endIdx > 0) {
      const candidate = text.slice(anchor, endIdx + 1);
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed?.questions)) return { questions: parsed.questions };
      } catch {
        /* not valid JSON — fall through */
      }
    }
  }

  return null;
}
