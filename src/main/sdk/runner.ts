// GenerationRunner — drives a single zai-agent-core `query()` invocation
// for the PPT-generation prompt. Replaces the previous vendored SDK call
// while keeping the consumer-visible surface (`onEvent`, `onProgress`,
// `onDone`, `onError` callbacks) intact so `ppt-orchestrator.ts` does not
// need to be rewritten.

import type { Settings } from "../../shared/types.js";
import { runZaiQuery, type BridgedEvent } from "./zai-bridge.js";

const PROGRESS_EVERY = 200;

export interface RunnerOptions {
  cwd: string;
  topic: string;
  outline: string;
  settings: Settings;
  runId: string;
  /** Test-only: provide canned bridged events instead of calling real zai. */
  sdkEvents?: BridgedEvent[];
  /**
   * Override the default system prompt. If omitted, falls back to
   * `buildSystemPrompt(topic, outline)` (HTML PPT generation).
   * Stage 2 outline generation and Stage 4 slide regeneration pass their
   * own prompt builders here.
   */
  systemPrompt?: string;
  /** Override the user message sent to the model. Default: 'Generate the PPT.' */
  userMessage?: string;
  /**
   * @deprecated zai 0.1.0 has no per-tool disable API. Tool selection is
   * controlled by `toolsOverride: 'none'` + `additionalTools` in zai-bridge,
   * which exposes exactly the FileRead/Write/Edit + Glob/Grep tools. The
   * field is kept for source-level back-compat but ignored.
   */
  disallowedTools?: string[];
  /**
   * @deprecated zai 0.1.0 manages sessions via `TranscriptStore` and the
   * `transcriptId` QueryOption. The vendor SDK's `continue`/`resume` API
   * is gone. The field is kept for source-level back-compat but ignored.
   */
  continueSession?: boolean;
  /** @deprecated See {@link continueSession}. */
  resumeSessionId?: string;
  /**
   * @deprecated zai 0.1.0 has no per-query MCP registration; the runtime
   * loads MCP servers from `RuntimeConfig.mcpServers` once. BriefAgent
   * (which was the only consumer of this field) is removed.
   */
  mcpServers?: Record<string, unknown>;
  /**
   * Override zai's default `maxTurns`. Default: 3. Tests / slide regeneration
   * pass 1; multi-turn agents historically used 10.
   */
  maxTurns?: number;
  onEvent: (msg: BridgedEvent) => void;
  onProgress: (info: { phase: string; current: number }) => void;
  onDone: (info: { html: string; durationMs: number; sessionId?: string }) => void;
  onError: (info: { error: { code: string; message: string; retryable: boolean } }) => void;
}

export class GenerationRunner {
  private buffer = "";
  private resultType: string | null = null;
  private durationMs = 0;
  private queryInterrupt: (() => void) | null = null;
  private aborted = false;
  html: string | null = null;
  resultSubtype: string | null = null;
  /** Captured session id from the upstream zai stream (used by callers that
   *  want to chain a follow-up query with `transcriptId`). */
  sessionId: string | undefined = undefined;

  constructor(private opts: RunnerOptions) {}

  async run(): Promise<void> {
    const start = Date.now();
    // Test mode: drain the canned events array instead of calling zai.
    if (this.opts.sdkEvents) {
      for (const ev of this.opts.sdkEvents) {
        if (this.aborted) break;
        this.opts.onEvent(ev);
        await this.handle(ev);
      }
      this.durationMs = Date.now() - start;
      this.finish();
      return;
    }

    try {
      const stream = runZaiQuery({
        prompt: this.opts.userMessage ?? "Generate the PPT.",
        cwd: this.opts.cwd,
        model: this.opts.settings.llm.model,
        systemPrompt: this.opts.systemPrompt ?? buildSystemPrompt(this.opts.topic, this.opts.outline),
        maxTurns: this.opts.maxTurns ?? 3,
        baseUrl: this.opts.settings.llm.baseUrl,
        apiKey: this.opts.settings.llm.apiKey,
      });
      for await (const ev of stream) {
        if (this.aborted) break;
        this.opts.onEvent(ev);
        await this.handle(ev);
      }
    } catch (err) {
      this.opts.onError({
        error: { code: "INTERNAL", message: String(err), retryable: false },
      });
      return;
    }
    this.durationMs = Date.now() - start;
    this.finish();
  }

  private async handle(ev: BridgedEvent): Promise<void> {
    if (ev.type === "assistant") {
      this.buffer += ev.text;
      if (this.buffer.length % PROGRESS_EVERY < ev.text.length) {
        this.opts.onProgress({ phase: "streaming", current: this.buffer.length });
      }
      return;
    }
    if (ev.type === "result") {
      this.resultType = ev.subtype;
      if (ev.sessionId) this.sessionId = ev.sessionId;
    }
  }

  private finish(): void {
    this.resultSubtype = this.resultType;
    if (this.resultType === "success") {
      this.html = this.buffer;
      this.opts.onDone({
        html: this.buffer,
        durationMs: this.durationMs,
        ...(this.sessionId ? { sessionId: this.sessionId } : {}),
      });
      return;
    }
    const message =
      this.resultType === "error"
        ? this.buffer || "Generation failed"
        : `Generation failed: ${this.resultType ?? "unknown"}`;
    this.opts.onError({
      error: {
        code: "INTERNAL",
        message,
        retryable: this.resultType === "cancelled" || this.resultType === "error",
      },
    });
  }

  interrupt(): void {
    this.aborted = true;
    this.queryInterrupt?.();
  }
}

// ---------------------------------------------------------------------------
// Default system prompt (HTML PPT generation). The previous vendored SDK
// supported a `{type:'preset', append}` shape that appended our prompt
// to the SDK's default prompt (which includes the tool catalog). zai
// 0.1.0 takes a plain `string`, so we concatenate the global tool catalog
// here ourselves.
// ---------------------------------------------------------------------------

function buildSystemPrompt(topic: string, outline: string): string {
  return [
    "你是 PPT 内容编辑 + 视觉设计师。",
    `主题：${topic}`,
    "当前 outline：",
    outline,
    "可用工具：Read / Write / Edit / Glob / Grep。",
    "请用 Write 工具把 HTML 写到当前工作目录下的 slides/ 目录，每个 slide 一个文件。",
  ].join("\n");
}
