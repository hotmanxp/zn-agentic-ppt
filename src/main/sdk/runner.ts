// @ts-ignore vendor bundle — no types available
import { query as sdkQuery } from "../../../vendor/sdk.mjs";
import type { Settings } from "../../shared/types.js";
import { ensureLsToolRegistered } from "./lsTool.js";
import { buildSystemPrompt } from "./prompts.js";

// Register LS once at module load. Silences vendor SDK's
// "agent references unknown tool 'LS'" warning emitted by injectAgents when
// plugins (e.g. feature-dev) declare `LS` in their agent's tools list.
ensureLsToolRegistered();

export interface RunnerOptions {
  cwd: string;
  topic: string;
  outline: string;
  settings: Settings;
  runId: string;
  /** Test-only: provide canned events instead of calling real SDK */
  sdkEvents?: any[];
  /**
   * Override the default system prompt. If omitted, falls back to
   * `buildSystemPrompt(topic, outline)` (HTML PPT generation).
   * Stage 2 outline generation and Stage 4 slide regeneration pass their
   * own prompt builders here.
   */
  systemPrompt?: string;
  /** Override the user message sent to the model. Default: 'Generate the PPT.' */
  userMessage?: string;
  /** Optional MCP server config (e.g. per-slide file read/write tools) */
  mcpServers?: Record<string, unknown>;
  /**
   * Override SDK's default `disallowedTools` list. Default: `['Bash']`
   * (preserves Bash block for safety). BriefAgent overrides this to disable
   * all file tools so the LLM focuses on the in-process AskUserQuestion MCP
   * tool instead of exploring the working directory.
   */
  disallowedTools?: string[];
  /**
   * Override SDK's default `maxTurns`. Default: 3. BriefAgent needs
   * ≥ 3 assistant turns (ask → answer → ask → answer → final JSON)
   * plus headroom for retries, so it passes 10.
   */
  maxTurns?: number;
  /**
   * Resume the most recent session for this cwd (no sessionId needed).
   * Sets `continue: true` on the SDK query so prior turns stay in context.
   * Used by BriefAgent to maintain multi-turn conversation context when
   * the LLM asks the user clarifying questions.
   */
  continueSession?: boolean;
  /**
   * Resume a specific session by ID. Takes precedence over `continueSession`.
   */
  resumeSessionId?: string;
  onEvent: (msg: any) => void;
  onProgress: (info: { phase: string; current: number }) => void;
  onDone: (info: { html: string; durationMs: number; sessionId?: string }) => void;
  onError: (info: { error: { code: string; message: string; retryable: boolean } }) => void;
}

const PROGRESS_EVERY = 200;

export class GenerationRunner {
  private buffer = "";
  private resultType: string | null = null;
  private durationMs = 0;
  private query: any;
  html: string | null = null;

  constructor(private opts: RunnerOptions) {
    // Initialize query so interrupt() works even before run() is called (test mode)
    if (opts.sdkEvents) {
      this.query = sdkQuery({ __events: opts.sdkEvents, prompt: "", options: {} });
    }
  }

  async run(): Promise<void> {
    if (this.opts.sdkEvents) {
      for (const ev of this.opts.sdkEvents) await this.handle(ev);
      this.finish();
      return;
    }
    this.query = sdkQuery({
      prompt: this.opts.userMessage ?? "Generate the PPT.",
      options: {
        cwd: this.opts.cwd,
        model: this.opts.settings.llm.model,
        // Resume prior session context (used by BriefAgent multi-turn).
        ...(this.opts.continueSession ? { continue: true } : {}),
        ...(this.opts.resumeSessionId ? { resume: this.opts.resumeSessionId } : {}),
        // SDK accepts systemPrompt in 3 shapes (upstream query.ts:1081-1092):
        //   - string                       → fully replaces default
        //   - {type:'custom',content}      → fully replaces default
        //   - {type:'preset', append}      → appends to default
        // The 3rd form is what we need: the SDK default contains the tool
        // list (descriptions + JSON schemas) for any MCP servers registered
        // via mcpServers. If we pass a plain string, the LLM never sees
        // our custom tools (e.g. AskUserQuestion) and skips them.
        systemPrompt: this.opts.systemPrompt
          ? { type: "preset", append: this.opts.systemPrompt }
          : { type: "preset", append: buildSystemPrompt(this.opts.topic, this.opts.outline) },
        env: {
          ANTHROPIC_BASE_URL: this.opts.settings.llm.baseUrl,
          ANTHROPIC_AUTH_TOKEN: this.opts.settings.llm.apiKey,
        },
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        // canUseTool is REQUIRED by the SDK (defaults deny everything if
        // omitted). We allow all built-in tools; Bash is also blocked
        // via disallowedTools below for safety. The expanded default
        // list also disables NotebookRead/NotebookEdit (referenced by
        // SDK's built-in agents — when the validator tries to look up
        // their inputSchema.safeParse and it's missing, the SDK throws
        // "Cannot read properties of undefined (reading 'safeParse')"
        // and our regeneration IPC fails with a confusing error).
        canUseTool: async () => ({ behavior: "allow" }) as any,
        disallowedTools: this.opts.disallowedTools ?? [
          "Bash",
          "Read",
          "Write",
          "Edit",
          "Glob",
          "Grep",
          "NotebookRead",
          "NotebookEdit",
          "WebFetch",
          "WebSearch",
          "TodoWrite",
        ],
        maxTurns: this.opts.maxTurns ?? 3,
        // Forward MCP servers so the SDK injects their tools into the
        // model context. Without this, custom tools (e.g. AskUserQuestion
        // registered by BriefAgent) won't be visible to the LLM and it
        // will skip them and emit final JSON directly.
        ...(this.opts.mcpServers ? { mcpServers: this.opts.mcpServers } : {}),
      },
    });
    try {
      for await (const msg of this.query) {
        this.opts.onEvent(msg);
        await this.handle(msg);
      }
    } catch (err) {
      this.opts.onError({
        error: { code: "INTERNAL", message: String(err), retryable: false },
      });
      return;
    }
    this.finish();
  }

  private async handle(msg: any): Promise<void> {
    if (msg.type === "assistant") {
      for (const block of msg.message?.content ?? []) {
        if (block.type === "text") {
          this.buffer += block.text;
          if (this.buffer.length % PROGRESS_EVERY < block.text.length) {
            this.opts.onProgress({ phase: "streaming", current: this.buffer.length });
          }
        }
      }
    } else if (msg.type === "result") {
      this.resultType = msg.subtype;
      this.durationMs = msg.duration_ms ?? 0;
    }
  }

  private finish(): void {
    if (this.resultType === "success") {
      this.html = this.buffer;
      const sessionId = this.query?.sessionId;
      this.opts.onDone({
        html: this.buffer,
        durationMs: this.durationMs,
        ...(sessionId ? { sessionId } : {}),
      });
    } else {
      this.opts.onError({
        error: {
          code: "INTERNAL",
          message: `Generation failed: ${this.resultType ?? "unknown"}`,
          retryable: true,
        },
      });
    }
  }

  interrupt(): void {
    if (this.opts.sdkEvents) {
      // In test mode the mock's interrupt is captured via the opts.sdkEvents
      // array iteration closure — but to call it we need to reach into the
      // mock. Since we can't import test-only symbols into production code,
      // we set this.query to the mock-returned object during run().
      this.query?.interrupt();
      return;
    }
    this.query?.interrupt();
  }
}
