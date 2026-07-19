/**
 * BackgroundRuntime lifecycle.
 *
 * zai-agent-core's AgentTool only uses background mode when
 * `hasBackgroundRuntime()` is true. Without an init call, AgentTool
 * silently falls back to the synchronous (per-call `queryEngine`)
 * path, which serialises every sub-agent — defeating the whole
 * "parent + N parallel sub-agents" design.
 *
 * This module owns the singleton. Init it once per `runZaiQuery`
 * so the BackgroundRuntime shares the same agent runtime as the
 * parent (and therefore the same abort signal + settings).
 */
import { join } from "node:path";
import {
  DefaultBackgroundRuntime,
  JsonTaskStore,
  setBackgroundRuntime,
} from "./zai-agent-core/runtime/background/index.js";
import type { DefaultAgentRuntime } from "./zai-agent-core/runtime/contract.js";

const DEFAULT_MAX_CONCURRENT = 8;

let _initialised = false;
let _currentRuntime: DefaultBackgroundRuntime | null = null;

/**
 * Re-initialise the BackgroundRuntime tied to the given agent runtime.
 * Each `runZaiQuery` builds a fresh `perQueryRuntime`, so the
 * BackgroundRuntime has to be re-bound to the new one (the old
 * singleton is unregister-replaced). Idempotent within a single
 * perQueryRuntime identity.
 */
export function initBackgroundRuntimeFor(opts: {
  dataDir: string;
  agentRuntime: DefaultAgentRuntime;
  maxConcurrent?: number;
}): DefaultBackgroundRuntime {
  if (_initialised && _currentRuntime) return _currentRuntime;
  const store = new JsonTaskStore(join(opts.dataDir, "background-tasks"));
  const runtime = new DefaultBackgroundRuntime({
    agentRuntime: opts.agentRuntime,
    store,
    maxConcurrent: opts.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
  });
  setBackgroundRuntime(runtime);
  _initialised = true;
  _currentRuntime = runtime;
  return runtime;
}

/**
 * Reset between runZaiQuery invocations. The previous singleton
 * becomes unreachable but stays in memory until the next GC; we
 * don't `setBackgroundRuntime(null)` because that would race with
 * the in-flight stream.
 */
export function resetBackgroundRuntimeForTests(): void {
  setBackgroundRuntime(null);
  _initialised = false;
  _currentRuntime = null;
}
