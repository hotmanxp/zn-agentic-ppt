// zai-bridge — translates vendor SDK message shape into the opencc-internals
// RuntimeEvent stream expected by `@zn-ai/zai-agent-core`'s `query()`.
//
// This module is the **only** file in `src/main/sdk/` that imports the
// vendored agent runtime. GenerationRunner, connection test, and any future
// consumer of the bridge see a stable `{type: 'assistant' | 'result' | 'system'}`
// event shape, identical to the previous vendor SDK, so orchestrator code
// does not need to be rewritten.

import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import {
  OPEN_PLATFORM_BASE_URL,
  OPEN_PLATFORM_CREDENTIAL_PATH,
} from "../../shared/types.js";
import * as settingsFs from "../fs/settings.js";
// `app` is read lazily (inside `getRuntime` / `runZaiQuery`) so that the
// bridge module can be loaded in test environments where Electron's main-
// process binary is not available. Production code calls these from the
// Electron main thread; tests inject a runtime via `_setRuntimeForTests`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _electronApp: any = null;
async function getApp(): Promise<any> {
  if (_electronApp) return _electronApp;
  _electronApp = (await import("electron")).app;
  return _electronApp;
}

import { FileEditTool } from "./zai-agent-core/tools/FileEditTool/FileEditTool.js";
import { FileReadTool } from "./zai-agent-core/tools/FileReadTool/FileReadTool.js";
import { FileWriteTool } from "./zai-agent-core/tools/FileWriteTool/FileWriteTool.js";
import { GlobTool } from "./zai-agent-core/tools/GlobTool/GlobTool.js";
import { GrepTool } from "./zai-agent-core/tools/GrepTool/GrepTool.js";
import { AgentTool } from "./zai-agent-core/tools/AgentTool/AgentTool.js";
import { wrapAsOpenccTool } from "./zai-agent-core/tools/legacyAdapter.js";
import { DefaultAgentRuntime } from "./zai-agent-core/runtime/contract.js";
import { initBackgroundRuntimeFor } from "./background-runtime.js";
import type { QueryOptions, RuntimeConfig } from "./zai-agent-core/runtime/types.js";
import type { Tool } from "./zai-agent-core/tools/Tool.js";

// ---------------------------------------------------------------------------
// Open-platform authentication state
// ---------------------------------------------------------------------------

type OpenPlatformAuthState =
  | { ok: true; accessToken: string }
  | { ok: false; reason: string };

let openPlatformEnabled = false;
let openPlatformAuth: OpenPlatformAuthState = {
  ok: false,
  reason: "凭据尚未初始化",
};
const openPlatformMode = new AsyncLocalStorage<boolean>();

export async function initializeOpenPlatformAuth(
  enabled: boolean,
  filePath = join(homedir(), ".nova", "openAuth2.json"),
): Promise<void> {
  openPlatformEnabled = enabled;

  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    openPlatformAuth = {
      ok: false,
      reason: code === "ENOENT" ? "凭据文件不存在" : "无法读取凭据文件",
    };
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    openPlatformAuth = { ok: false, reason: "凭据文件不是有效 JSON" };
    return;
  }

  const token =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { access_token?: unknown }).access_token
      : undefined;
  if (typeof token !== "string" || !token.trim()) {
    openPlatformAuth = { ok: false, reason: "凭据字段缺失或无效" };
    return;
  }

  openPlatformAuth = { ok: true, accessToken: token.trim() };
}

export function setOpenPlatformEnabled(enabled: boolean): void {
  openPlatformEnabled = enabled;
}

export function withOpenPlatformMode<T>(
  enabled: boolean,
  run: () => Promise<T>,
): Promise<T> {
  return openPlatformMode.run(enabled, run);
}

const isVitest =
  process.env.NODE_ENV === "test" && process.env.VITEST === "true";
if (!isVitest) {
  const settings = await settingsFs.getSettings();
  await initializeOpenPlatformAuth(settings.llm.useOpenPlatform);
}

// ---------------------------------------------------------------------------
// Tools enabled for the LLM. We keep Read/Write/Edit + Glob/Grep so the
// slide-generation prompt ("LLM edits slides/<id>.html directly") still
// works, but we deliberately exclude BashTool, AgentTool, and the AskUser
// family. `toolsOverride: 'none'` (passed to `query()` below) drops the
// zai base set entirely and uses only `additionalTools`.
// ---------------------------------------------------------------------------

// 子 agent 工具集：单 slide 生成 + 自检 + Edit 迭代
// （不含 Agent —— 单 slide 任务不递归）
export const SUB_AGENT_TOOLS: Tool[] = [
  wrapAsOpenccTool(FileReadTool),
  wrapAsOpenccTool(FileWriteTool),
  wrapAsOpenccTool(FileEditTool),
  wrapAsOpenccTool(GlobTool),
  wrapAsOpenccTool(GrepTool),
];

// 父 agent 工具集：派发子任务 + 检阅子 agent 产出
// （不含 Write/Edit —— 父 agent 不写文件）
export const PARENT_AGENT_TOOLS: Tool[] = [
  wrapAsOpenccTool(FileReadTool),
  wrapAsOpenccTool(GlobTool),
  wrapAsOpenccTool(GrepTool),
  wrapAsOpenccTool(AgentTool),
];

// 保留 BRIDGE_TOOLS 别名指向 SUB_AGENT_TOOLS，向后兼容旧调用点
export const BRIDGE_TOOLS: Tool[] = SUB_AGENT_TOOLS;

// ---------------------------------------------------------------------------
// Bridged event shape. Mirrors the subset of the vendored SDK's `msg.type`
// values the rest of the project already consumes via
// `GenerationRunner.onEvent`. GenerationRunner reads text incrementally
// (assistant) and final result (result) and session id (system init).
// ---------------------------------------------------------------------------

export type BridgedEvent =
  | { type: "system"; subtype: "init"; sessionId?: string; models?: string[] }
  | { type: "assistant"; text: string }
  | {
      type: "result";
      subtype: "success" | "error" | "cancelled";
      text?: string;
      error?: string;
      sessionId?: string;
    };

// ---------------------------------------------------------------------------
// Runtime singleton
// ---------------------------------------------------------------------------

let _runtime: DefaultAgentRuntime | null = null;

export function getRuntime(): DefaultAgentRuntime {
  if (_runtime) return _runtime;
  // Caller must run inside the Electron main process. The dataDir here is
  // unused (every `runZaiQuery` constructs its own per-query runtime with
  // the real `app.getPath("userData")` resolved lazily).
  const config: RuntimeConfig = {
    dataDir: process.env.ZAI_DATA_DIR ?? "/tmp/zn-agentic-ppt",
    defaultModel: "claude-sonnet-4-5",
    defaultMaxTurns: 50,
    defaultPermissionMode: "bypassPermissions",
  };
  _runtime = new DefaultAgentRuntime(config);
  return _runtime;
}

/**
 * For tests: allow replacing the runtime (and its `run` method) without
 * touching Electron's `app.getPath` in a non-Electron process.
 */
export function _setRuntimeForTests(rt: DefaultAgentRuntime | null): void {
  _runtime = rt;
}

// ---------------------------------------------------------------------------
// Anthropic SDK plumbing for `ModelCaller`
// ---------------------------------------------------------------------------

// `Anthropic` from `@anthropic-ai/sdk` is both a runtime class and a
// namespace; the SDK ships a CJS interop default that, depending on the
// tsconfig's `esModuleInterop` setting, can be the constructor or a wrapper.
// Cast through `unknown` so the bridge type-checks under either setting.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnthropicCtor = Anthropic as unknown as new (opts: any) => any;

function makeAnthropicClient(opts: { baseUrl: string; apiKey: string }): any {
  return new AnthropicCtor({
    apiKey: opts.apiKey,
    baseURL: opts.baseUrl,
    dangerouslyAllowBrowser: true,
  });
}

// ---------------------------------------------------------------------------
// `ModelCaller` adapter. Drives Anthropic Messages streaming and yields
// `RawMessageStreamEvent`s in the order zai's `queryEngine` expects.
// ---------------------------------------------------------------------------

export type ModelCallerOpts = {
  baseUrl: string;
  apiKey: string;
};

export function resolveLlmCredentials(manual: ModelCallerOpts): ModelCallerOpts {
  const enabled = openPlatformMode.getStore() ?? openPlatformEnabled;
  if (!enabled) return manual;
  if (!openPlatformAuth.ok) {
    throw new Error(
      `开放平台登录凭据不可用：${openPlatformAuth.reason}。请检查 ${OPEN_PLATFORM_CREDENTIAL_PATH} 后完全重启应用。`,
    );
  }
  return {
    baseUrl: OPEN_PLATFORM_BASE_URL,
    apiKey: openPlatformAuth.accessToken,
  };
}

export function createModelCaller(opts: ModelCallerOpts) {
  // The zai `ModelCaller` return type is a strict union of the seven known
  // `RawMessageStreamEvent` shapes; we cast to `any` here because Anthropic's
  // SDK stream events carry extra fields per type (e.g. `message` on start,
  // `index` on deltas) that zai's narrowing cannot see.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async function* modelCaller(req: {
    model: string;
    systemPrompt: string | Array<{ type: string; [k: string]: unknown }> | undefined;
    messages: Array<{ role: "user" | "assistant"; content: unknown }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: Array<{ name: string; [k: string]: unknown }>;
    signal: AbortSignal;
  }): AsyncGenerator<any, any, any> {
    // Resolve credentials and build the Anthropic client for every invocation
    // so the AsyncLocalStorage request override is respected each time, even
    // when the same `modelCaller` is reused concurrently under opposite modes.
    const client = makeAnthropicClient(resolveLlmCredentials(opts));
    const sys = Array.isArray(req.systemPrompt)
      ? req.systemPrompt
          .map((b) =>
            typeof b === "object" && b && "text" in b
              ? String((b as unknown as { text: unknown }).text)
              : "",
          )
          .join("")
      : (req.systemPrompt ?? "");

    const anthropicTools = req.tools.map((t) => ({
      name: t.name,
      description:
        typeof t.description === "string"
          ? t.description
          : ((t as unknown as { description?: string }).description ?? ""),
      // Tools in zai use zod schemas wrapped under `inputSchema`; Anthropic
      // expects `input_schema` as a plain JSON Schema object. Pass through.
      input_schema:
        (t as unknown as { inputSchema?: unknown }).inputSchema ?? {
          type: "object",
          properties: {},
        },
    }));

    const stream = client.messages.stream({
      model: req.model,
      system: sys,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: req.messages as any,
      tools:
        anthropicTools.length > 0
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (anthropicTools as any)
          : undefined,
      max_tokens: 8192,
    });

    for await (const ev of stream) {
      if (req.signal.aborted) {
        try {
          stream.controller.abort();
        } catch {
          // ignore
        }
        return;
      }
      yield ev;
    }
  };
}

// ---------------------------------------------------------------------------
// Public API: `runZaiQuery`
// ---------------------------------------------------------------------------

export type RunZaiQueryOpts = {
  prompt: string;
  cwd: string;
  model?: string;
  systemPrompt?: string;
  userMessage?: string;
  maxTurns?: number;
  baseUrl: string;
  apiKey: string;
  /** Optional test-only override: when set, used instead of `runtime.run()`. */
  _testStream?: AsyncIterable<unknown>;
  /** Tool set passed to the runtime. Defaults to BRIDGE_TOOLS (== SUB_AGENT_TOOLS).
   *  Pass PARENT_AGENT_TOOLS for the orchestrator parent agent. */
  additionalTools?: Tool[];
};

export async function* runZaiQuery(
  opts: RunZaiQueryOpts,
): AsyncGenerator<BridgedEvent> {
  const modelCaller = createModelCaller({ baseUrl: opts.baseUrl, apiKey: opts.apiKey });

  const queryOpts: QueryOptions = {
    prompt: opts.prompt,
    cwd: opts.cwd,
    model: opts.model,
    systemPrompt: opts.systemPrompt,
    maxTurns: opts.maxTurns ?? 3,
    additionalTools: opts.additionalTools ?? BRIDGE_TOOLS,
    toolsOverride: "none",
    abortSignal: new AbortController().signal,
  };

  // Attach a per-query modelCaller via a temporary runtime so we don't have
  // to thread `baseUrl`/`apiKey` through the singleton RuntimeConfig.
  // `dataDir` is read lazily so test environments without a real Electron
  // `app` can still drive the bridge (the value is unused in test mode).
  const appMod = await getApp();
  const dataDir = appMod ? appMod.getPath("userData") : process.env.ZAI_DATA_DIR ?? "/tmp/zn-agentic-ppt";
  const perQueryRuntime = new DefaultAgentRuntime({
    dataDir,
    defaultModel: opts.model ?? "claude-sonnet-4-5",
    defaultMaxTurns: opts.maxTurns ?? 3,
    defaultPermissionMode: "bypassPermissions",
    modelCaller,
  });
  // Wire BackgroundRuntime so AgentTool's `run_in_background: true` actually
  // dispatches to the queue (otherwise it silently falls back to synchronous
  // mode and serialises every sub-agent — the main reason the parent LLM
  // "真并行" design didn't materialise).
  initBackgroundRuntimeFor({ dataDir, agentRuntime: perQueryRuntime });

  const stream = opts._testStream ?? perQueryRuntime.run(queryOpts);
  for await (const rawEvent of stream) {
    yield translateRuntimeEvent(rawEvent);
  }
}

// ---------------------------------------------------------------------------
// RuntimeEvent → BridgedEvent translation
// ---------------------------------------------------------------------------

function translateRuntimeEvent(raw: unknown): BridgedEvent {
  const ev = raw as { type?: string; [k: string]: unknown };
  const t = ev?.type;
  if (t === "runtime.done") {
    const text = typeof ev.text === "string" ? ev.text : "";
    return {
      type: "result",
      subtype: "success",
      text,
      sessionId: typeof ev.sessionId === "string" ? ev.sessionId : undefined,
    };
  }
  if (t === "runtime.error") {
    const err =
      (ev.error as { message?: string } | undefined)?.message ?? "unknown error";
    return { type: "result", subtype: "error", error: err };
  }
  if (t === "runtime.aborted") {
    return { type: "result", subtype: "cancelled" };
  }
  // zai emits stream-level assistant text deltas via wrapped RawMessageStreamEvent
  // objects with `type: "content_block_delta"` and `delta.type: "text_delta"`.
  if (t === "content_block_delta") {
    const delta = (ev as { delta?: { type?: string; text?: string } }).delta;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      return { type: "assistant", text: delta.text };
    }
  }
  // message_start carries the model + session id; surface a system-init event
  // so connection tests can list the model. For session id we forward when present.
  if (t === "message_start") {
    const message = (ev as { message?: { model?: string; id?: string } }).message;
    return {
      type: "system",
      subtype: "init",
      sessionId: message?.id,
      models: message?.model ? [message.model] : undefined,
    };
  }
  // Anything else (tool_use, content_block_start, etc.) is dropped; GenerationRunner
  // only reads assistant text + result.
  return { type: "system", subtype: "init" };
}
