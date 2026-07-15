// connection.ts — LLM connectivity test for the settings UI. Replaces the
// previous vendored SDK ping with a zai-agent-core call that reports the
// list of available models back to the caller.

import type { Settings } from "../../shared/types.js";
import { runZaiQuery, type BridgedEvent } from "./zai-bridge.js";

export async function testLLMConnection(
  settings: Settings,
): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  const cwd = "/tmp/zn-agentic-ppt-connection-test";
  try {
    const stream = runZaiQuery({
      prompt: "ping",
      cwd,
      model: settings.llm.model,
      systemPrompt: "You are a connectivity test. Respond with the single word 'pong'.",
      maxTurns: 1,
      baseUrl: settings.llm.baseUrl,
      apiKey: settings.llm.apiKey,
    });
    let result: BridgedEvent | null = null;
    for await (const ev of stream) {
      if (ev.type === "result") {
        result = ev;
        if (ev.subtype !== "success") break;
      }
    }
    if (!result) return { ok: false, error: "no result from LLM" };
    if (result.subtype === "error") return { ok: false, error: result.error ?? "unknown error" };
    if (result.subtype === "cancelled") return { ok: false, error: "cancelled" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function supportedModels(settings: Settings): Promise<string[]> {
  // The vendored SDK returned a model list from a `system:init` event; zai
  // does not surface a model list (the LLM only knows its own). Until
  // zai 0.1.0 grows a `model list` API, we just confirm the configured
  // model responds. A future commit can call `client.models.list({baseURL})`
  // for Anthropic-compatible providers.
  const r = await testLLMConnection(settings);
  return r.ok && settings.llm.model ? [settings.llm.model] : [];
}
