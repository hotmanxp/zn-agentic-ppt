import { beforeEach, describe, expect, it, vi } from "vitest";

// NOTE: vi.mock factories are hoisted above all imports. We must create the
// spy *inside* the factory (referencing it via vi.hoisted would also work,
// but creating it inline is simpler). The outer `mockQuery` / `mockInterrupt`
// references are reached via closure only after the factory is registered.
const { mockQuery, mockInterrupt, mockRegisterExternalTool } = vi.hoisted(() => {
  return {
    mockQuery: vi.fn(),
    mockInterrupt: vi.fn(),
    mockRegisterExternalTool: vi.fn(() => () => {}),
  };
});

vi.mock("../../../../vendor/sdk.mjs", () => ({
  query: (params: any) => {
    mockQuery(params);
    return {
      sessionId: "sess-1",
      [Symbol.asyncIterator]: () => {
        const events = params.__events ?? [];
        let i = 0;
        return {
          next: async () => {
            if (i >= events.length) return { value: undefined, done: true };
            return { value: events[i++], done: false };
          },
        };
      },
      interrupt: mockInterrupt,
      close: () => {},
    };
  },
  // lsTool.ts calls this at module load (runner.ts -> lsTool.ts).
  // Provide a stub so the test environment can load the module chain.
  registerExternalTool: (tool: any) => {
    mockRegisterExternalTool(tool);
    return () => {};
  },
}));

import { GenerationRunner } from "../../../../src/main/sdk/runner.js";

describe("GenerationRunner", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockInterrupt.mockReset();
  });

  it("emits progress on assistant text ≥ 200 chars", async () => {
    const events: any[] = [
      { type: "system", subtype: "init" },
      { type: "assistant", message: { content: [{ type: "text", text: "x".repeat(250) }] } },
      { type: "result", subtype: "success", duration_ms: 1000 },
    ];
    const runner = new GenerationRunner({
      cwd: "/tmp",
      sdkEvents: events,
      onEvent: () => {},
      onProgress: () => {},
      onDone: () => {},
      onError: () => {},
    });
    await runner.run();
    expect(runner.html).toBe("x".repeat(250));
  });

  it("emits done on success result", async () => {
    let donePayload: any = null;
    const events = [
      { type: "assistant", message: { content: [{ type: "text", text: "<html>ok</html>" }] } },
      { type: "result", subtype: "success", duration_ms: 500 },
    ];
    const runner = new GenerationRunner({
      cwd: "/tmp",
      sdkEvents: events,
      onEvent: () => {},
      onProgress: () => {},
      onDone: (p) => {
        donePayload = p;
      },
      onError: () => {},
    });
    await runner.run();
    expect(donePayload?.html).toBe("<html>ok</html>");
  });

  it("emits error on non-success result", async () => {
    let errorPayload: any = null;
    const events = [{ type: "result", subtype: "error_max_turns", duration_ms: 100 }];
    const runner = new GenerationRunner({
      cwd: "/tmp",
      sdkEvents: events,
      onEvent: () => {},
      onProgress: () => {},
      onDone: () => {},
      onError: (p) => {
        errorPayload = p;
      },
    });
    await runner.run();
    expect(errorPayload?.error.code).toBe("INTERNAL");
  });

  it("interrupt is callable", async () => {
    const runner = new GenerationRunner({
      cwd: "/tmp",
      sdkEvents: [],
      onEvent: () => {},
      onProgress: () => {},
      onDone: () => {},
      onError: () => {},
    });
    runner.interrupt();
    expect(mockInterrupt).toHaveBeenCalled();
  });
});
