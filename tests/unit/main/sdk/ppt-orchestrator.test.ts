import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/zn-agentic-ppt-test" },
}));

// Redirect project FS to our tmp dir so writeProjectFramework doesn't pollute homedir.
import { setProjectsDirForTest } from "../../../../src/main/fs/paths.js";
import { mkdirSync } from "node:fs";

// Mock runZaiQuery so we can capture what the orchestrator passes
const mockStream = vi.fn();
vi.mock("../../../../src/main/sdk/zai-bridge.js", () => ({
  runZaiQuery: (...args: unknown[]) => mockStream(...args),
  PARENT_AGENT_TOOLS: [{ name: "Read" }, { name: "Glob" }, { name: "Grep" }, { name: "Agent" }],
}));

const { runOrchestrator } = await import("../../../../src/main/sdk/ppt-orchestrator.js");

describe("runOrchestrator (sub-agent rewrite, phase 1)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "orch-test-"));
    mkdirSync(join(tmp, "p1"), { recursive: true });
    setProjectsDirForTest(tmp);
    mockStream.mockReset();
  });

  it("calls runZaiQuery once with parent system prompt and per-slide sub prompts", async () => {
    async function* emptyStream() {
      yield { type: "runtime.done", text: "" };
    }
    mockStream.mockImplementation(() => emptyStream());

    const result = await runOrchestrator({
      projectId: "p1",
      outline: {
        topic: "T",
        slides: [
          { id: "s1", title: "A", bullets: ["a"] },
          { id: "s2", title: "B", bullets: ["b"] },
        ],
      } as any,
      settings: { llm: { baseUrl: "https://x", apiKey: "sk-fake", model: "test-model" } } as any,
      cwd: tmp,
    });

    expect(mockStream).toHaveBeenCalledTimes(1);
    const call = mockStream.mock.calls[0][0];
    expect(call.systemPrompt).toMatch(/验证标准/);
    expect(call.systemPrompt).toMatch(/<section>/);
    expect(call.prompt).toMatch(/slides\/s1\.html/);
    expect(call.prompt).toMatch(/slides\/s2\.html/);
    expect(call.additionalTools).toBeDefined();
    expect(call.additionalTools.length).toBe(4); // PARENT_AGENT_TOOLS
    expect(result.total).toBe(2);
  });
});
