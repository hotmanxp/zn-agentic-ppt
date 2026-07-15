import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub Electron's `app` so the zai-bridge import chain (which reads
// `app.getPath('userData')` at module load) succeeds in the vitest process.
vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/zn-agentic-ppt-test",
  },
}));

import { GenerationRunner } from "../../../../src/main/sdk/runner.js";
import type { BridgedEvent } from "../../../../src/main/sdk/zai-bridge.js";

// The test path mirrors `mock-sdk-iterator-drains-events`: in vitest, the
// bridged event array is drained in a single `runner.run()` call, so multi-
// turn agent tests cannot assert per-turn state — they only see the final
// accumulated buffer.

describe("GenerationRunner", () => {
  const fakeSettings = {
    llm: { provider: "anthropic", baseUrl: "https://x", apiKey: "sk-fake", model: "test-model" },
  } as any;

  function makeRunner(overrides: Partial<{
    sdkEvents: BridgedEvent[];
    onEvent: (e: BridgedEvent) => void;
    onProgress: (p: { phase: string; current: number }) => void;
    onDone: (p: { html: string; durationMs: number; sessionId?: string }) => void;
    onError: (p: { error: { code: string; message: string; retryable: boolean } }) => void;
  }> = {}): GenerationRunner {
    return new GenerationRunner({
      cwd: "/tmp",
      topic: "test topic",
      outline: "test outline",
      settings: fakeSettings,
      runId: "test-run",
      sdkEvents: [],
      onEvent: () => {},
      onProgress: () => {},
      onDone: () => {},
      onError: () => {},
      ...overrides,
    });
  }

  beforeEach(() => {
    vi.useRealTimers();
  });

  it("accumulates assistant text into the html buffer", async () => {
    const runner = makeRunner({
      sdkEvents: [
        { type: "system", subtype: "init" },
        { type: "assistant", text: "x".repeat(250) },
        { type: "result", subtype: "success" },
      ],
    });
    await runner.run();
    expect(runner.html).toBe("x".repeat(250));
    expect(runner.resultSubtype).toBe("success");
  });

  it("emits done on success result", async () => {
    let donePayload: { html: string; durationMs: number; sessionId?: string } | null = null;
    const runner = makeRunner({
      sdkEvents: [
        { type: "assistant", text: "<html>ok</html>" },
        { type: "result", subtype: "success", sessionId: "sess-1" },
      ],
      onDone: (p) => {
        donePayload = p;
      },
    });
    await runner.run();
    expect(donePayload?.html).toBe("<html>ok</html>");
    expect(donePayload?.sessionId).toBe("sess-1");
  });

  it("captures the session id from the final result event", async () => {
    const runner = makeRunner({
      sdkEvents: [
        { type: "assistant", text: "hello" },
        { type: "result", subtype: "success", sessionId: "sess-42" },
      ],
    });
    await runner.run();
    expect(runner.sessionId).toBe("sess-42");
  });

  it("emits error on non-success result", async () => {
    let errorPayload: { error: { code: string; message: string; retryable: boolean } } | null = null;
    const runner = makeRunner({
      sdkEvents: [{ type: "result", subtype: "error", error: "max_turns_reached" }],
      onError: (p) => {
        errorPayload = p;
      },
    });
    await runner.run();
    expect(errorPayload?.error.code).toBe("INTERNAL");
    expect(errorPayload?.error.retryable).toBe(true);
  });

  it("interrupt is a no-op in test mode (sdkEvents path)", async () => {
    // In test mode the runner drains sdkEvents synchronously in `run()`,
    // so `interrupt()` cannot stop a running iterator. The method exists
    // for production callers that drive the live zai stream.
    const runner = makeRunner();
    expect(() => runner.interrupt()).not.toThrow();
  });
});
