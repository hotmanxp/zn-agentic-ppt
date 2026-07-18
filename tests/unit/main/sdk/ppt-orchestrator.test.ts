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

describe("runOrchestrator event bridge", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "orch-evt-"));
    mkdirSync(join(tmp, "p1"), { recursive: true });
    mkdirSync(join(tmp, "slides"), { recursive: true });
    setProjectsDirForTest(tmp);
    mockStream.mockReset();
  });

  it("subagent:start first time triggers layout, second time does not (no flicker)", async () => {
    const readyEvents: any[] = [];
    async function* s() {
      yield { type: "subagent:start", subSessionId: "u1", description: "Generate slide s1" };
      yield { type: "subagent:start", subSessionId: "u2", description: "Generate slide s1" };
      yield { type: "runtime.done", text: "" };
    }
    mockStream.mockImplementation(() => s());

    await runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }] } as any,
      settings: { llm: { baseUrl: "https://x", apiKey: "sk-fake", model: "test-model" } } as any,
      cwd: tmp,
      onSlideReady: (slide) => readyEvents.push(slide),
    });

    const s1Layouts = readyEvents.filter((e) => e.id === "s1" && e.status === "layout");
    expect(s1Layouts).toHaveLength(1);
  });

  it("subagent:done + html file exists → done with html", async () => {
    const { writeFileSync: write } = await import("node:fs");
    write(join(tmp, "slides", "s1.html"), "<section data-layout='1'>ok</section>");

    const readyEvents: any[] = [];
    async function* s() {
      yield { type: "subagent:start", subSessionId: "u1", description: "Generate slide s1" };
      yield { type: "subagent:done", subSessionId: "u1", exitReason: "completed", output: "" };
      yield { type: "runtime.done", text: "" };
    }
    mockStream.mockImplementation(() => s());

    const result = await runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }] } as any,
      settings: { llm: { baseUrl: "https://x", apiKey: "sk-fake", model: "test-model" } } as any,
      cwd: tmp,
      onSlideReady: (slide) => readyEvents.push(slide),
    });

    const s1Done = readyEvents.find((e) => e.id === "s1" && e.status === "done");
    expect(s1Done).toBeDefined();
    expect(s1Done.html).toContain("<section");
    expect(result.completed).toBe(1);
  });

  it("subagent:done + html missing → failed with error", async () => {
    const readyEvents: any[] = [];
    async function* s() {
      yield { type: "subagent:start", subSessionId: "u1", description: "Generate slide s1" };
      yield { type: "subagent:done", subSessionId: "u1", exitReason: "error", output: "boom" };
      yield { type: "runtime.done", text: "" };
    }
    mockStream.mockImplementation(() => s());

    const result = await runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }] } as any,
      settings: { llm: { baseUrl: "https://x", apiKey: "sk-fake", model: "test-model" } } as any,
      cwd: tmp,
      onSlideReady: (slide) => readyEvents.push(slide),
    });

    const s1Failed = readyEvents.find((e) => e.id === "s1" && e.status === "failed");
    expect(s1Failed).toBeDefined();
    expect(s1Failed.error).toContain("boom");
    expect(result.failed).toBe(1);
  });

  it("runtime.aborted → cancelled=true in result", async () => {
    async function* s() {
      yield { type: "subagent:start", subSessionId: "u1", description: "Generate slide s1" };
      yield { type: "runtime.aborted" };
    }
    mockStream.mockImplementation(() => s());

    const result = await runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }] } as any,
      settings: { llm: { baseUrl: "https://x", apiKey: "sk-fake", model: "test-model" } } as any,
      cwd: tmp,
    });
    expect(result.cancelled).toBe(true);
  });

  it("runtime.error → remaining slides counted as failed", async () => {
    const { writeFileSync: write } = await import("node:fs");
    write(join(tmp, "slides", "s1.html"), "<section></section>");

    async function* s() {
      yield { type: "subagent:start", subSessionId: "u1", description: "Generate slide s1" };
      yield { type: "subagent:done", subSessionId: "u1", exitReason: "completed", output: "" };
      yield { type: "runtime.error", error: "max_turns" };
    }
    mockStream.mockImplementation(() => s());

    const result = await runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }, { id: "s2", title: "B" }] } as any,
      settings: { llm: { baseUrl: "https://x", apiKey: "sk-fake", model: "test-model" } } as any,
      cwd: tmp,
    });
    expect(result.completed).toBe(1);
    expect(result.failed).toBe(1); // s2 没机会完成 → failed
  });
});
