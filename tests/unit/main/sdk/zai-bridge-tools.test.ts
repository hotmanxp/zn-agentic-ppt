import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/zn-agentic-ppt-test" },
}));

// Capture the QueryOptions the runtime was constructed with so we can
// assert that runZaiQuery forwards additionalTools correctly.
let lastQueryOpts: unknown = null;
let lastRunOpts: unknown = null;
async function* emptyRun() {
  yield { type: "runtime.done", text: "" };
}

vi.mock("../../../../src/main/sdk/zai-agent-core/runtime/contract.js", () => ({
  DefaultAgentRuntime: class {
    constructor(opts: unknown) {
      lastQueryOpts = opts;
    }
    run(opts: unknown) {
      lastRunOpts = opts;
      return emptyRun();
    }
  },
}));

const zaiBridge = await import("../../../../src/main/sdk/zai-bridge.js");
const { SUB_AGENT_TOOLS, PARENT_AGENT_TOOLS, runZaiQuery } = zaiBridge;

function toolNames(tools: { name: string }[]): string[] {
  return tools.map((t) => t.name).sort();
}

describe("zai-bridge tool sets", () => {
  it("SUB_AGENT_TOOLS contains read/write/edit/glob/grep but no Agent", () => {
    expect(toolNames(SUB_AGENT_TOOLS)).toEqual(
      ["Edit", "Glob", "Grep", "Read", "Write"].sort(),
    );
  });

  it("PARENT_AGENT_TOOLS contains read/glob/grep/agent but no write/edit", () => {
    expect(toolNames(PARENT_AGENT_TOOLS)).toEqual(
      ["Agent", "Glob", "Grep", "Read"].sort(),
    );
  });
});

describe("runZaiQuery additionalTools parameter", () => {
  beforeEach(() => {
    lastQueryOpts = null;
    lastRunOpts = null;
  });

  it("forwards caller-provided additionalTools to the runtime", async () => {
    const stream = runZaiQuery({
      prompt: "ping",
      cwd: "/tmp",
      model: "test-model",
      systemPrompt: "sys",
      maxTurns: 1,
      baseUrl: "https://x",
      apiKey: "sk-fake",
      additionalTools: PARENT_AGENT_TOOLS,
    });
    // drain
    for await (const _ of stream) { /* noop */ }
    expect(lastRunOpts).toBeTruthy();
    expect((lastRunOpts as { additionalTools: unknown }).additionalTools).toBe(PARENT_AGENT_TOOLS);
  });

  it("falls back to SUB_AGENT_TOOLS when additionalTools is omitted", async () => {
    const stream = runZaiQuery({
      prompt: "ping",
      cwd: "/tmp",
      model: "test-model",
      baseUrl: "https://x",
      apiKey: "sk-fake",
    });
    for await (const _ of stream) { /* noop */ }
    expect((lastRunOpts as { additionalTools: unknown }).additionalTools).toBe(SUB_AGENT_TOOLS);
  });
});
