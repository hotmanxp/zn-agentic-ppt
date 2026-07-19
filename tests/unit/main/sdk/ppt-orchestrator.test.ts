import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setProjectsDirForTest } from "../../../../src/main/fs/paths.js";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/zn-agentic-ppt-test" },
}));

/**
 * Mock runtime: each `dispatch()` returns a fake task whose events()
 * stream is fed by `setOutcome(id, {type, html|error?})`. Events
 * stream auto-closes when a terminal event is pushed (mimics real
 * BackgroundRuntime behaviour).
 */
type Outcome = { type: "completed"; html?: string } | { type: "failed"; error: string };
const mockRuntime = vi.hoisted(() => {
  const tasks = new Map<string, { slideId: string; queue: Array<{ resolve: (v: IteratorResult<unknown>) => void }>; closed: { v: boolean } }>();
  let nextId = 0;
  return {
    tasks,
    nextId: () => `task-${++nextId}`,
    reset: () => { tasks.clear(); nextId = 0; mockRuntime.dispatched.length = 0; },
    dispatched: [] as Array<{ taskId: string; slideId: string; prompt: string }>,
  };
});

function push(taskId: string, event: unknown) {
  const t = mockRuntime.tasks.get(taskId);
  if (!t) return;
  if (t.closed.v) return;
  const next = t.queue.shift();
  if (next) next.resolve({ value: event, done: false });
  // Auto-close on terminal events so the orchestrator's for-await exits
  const type = (event as any)?.type;
  if (type === "completed" || type === "failed") {
    t.closed.v = true;
  }
}

vi.mock("../../../../src/main/sdk/zai-agent-core/runtime/background/registry.js", () => ({
  hasBackgroundRuntime: () => true,
  getBackgroundRuntime: () => ({
    async dispatch(input: { prompt: string; metadata?: { slideId?: string } }) {
      const id = mockRuntime.nextId();
      const queue: Array<{ resolve: (v: IteratorResult<unknown>) => void }> = [];
      const closed = { v: false };
      mockRuntime.tasks.set(id, { slideId: input.metadata?.slideId ?? "?", queue, closed });
      mockRuntime.dispatched.push({ taskId: id, slideId: input.metadata?.slideId ?? "?", prompt: input.prompt });
      return Promise.resolve({ id, status: "queued", prompt: input.prompt, metadata: input.metadata });
    },
    events(id: string) {
      const t = mockRuntime.tasks.get(id)!;
      return (async function* () {
        while (true) {
          if (t.closed.v && t.queue.length === 0) return;
          const v = await new Promise<IteratorResult<unknown>>((resolve) => t.queue.push({ resolve }));
          if (v.done) return;
          yield v.value;
        }
      })();
    },
    async get(id: string) {
      const t = mockRuntime.tasks.get(id);
      return t ? { id, status: t.closed.v ? "completed" : "running" } : null;
    },
    list() {
      return Array.from(mockRuntime.tasks.entries()).map(([id, t]) => ({
        id,
        status: t.closed.v ? "completed" : "running",
        metadata: { slideId: t.slideId },
      }));
    },
    async cancel() { return { ok: true }; },
    async shutdown() {},
  }),
}));

const { runOrchestrator } = await import("../../../../src/main/sdk/ppt-orchestrator.js");

let workDir: string;
beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "orch-"));
  mkdirSync(join(workDir, "p1"), { recursive: true });
  setProjectsDirForTest(workDir);
  mockRuntime.reset();
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** Auto-complete every dispatched task with the supplied outcome. */
function completeAll(outcome: Outcome = { type: "completed" }) {
  for (const { taskId, slideId } of mockRuntime.dispatched) {
    if (outcome.type === "completed") {
      // Write a passing slide file so validation succeeds
      mkdirSync(join(workDir, "slides"), { recursive: true });
      // Slide id is "s1", "s2", ... → extract 1-based index → matching layout id
      const idx = Number(slideId.replace(/\D/g, "")) || 1;
      const layout = ((idx - 1) % 5) + 1;
      const html = outcome.html ?? `<section data-layout="${layout}">${"x".repeat(300)}</section>`;
      writeFileSync(join(workDir, "slides", `${slideId}.html`), html);
    }
    push(taskId, { type: outcome.type, task: { id: taskId, status: outcome.type, ...(outcome.type === "failed" ? { error: { message: outcome.error } } : {}) } });
  }
}

describe("runOrchestrator (P1-4: direct BackgroundRuntime dispatch)", () => {
  it("writes per-slide task files and dispatches one task per slide", async () => {
    const r = runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }, { id: "s2", title: "B" }] } as any,
      settings: { llm: { baseUrl: "https://x", apiKey: "sk-fake", model: "test-model" } } as any,
      cwd: workDir,
    });
    await new Promise((res) => setTimeout(res, 20));
    expect(mockRuntime.dispatched.length).toBe(2);
    expect(existsSync(join(workDir, "tasks", "s1.md"))).toBe(true);
    expect(existsSync(join(workDir, "tasks", "s2.md"))).toBe(true);
    expect(readFileSync(join(workDir, "tasks", "s1.md"), "utf8")).toContain("A");
    completeAll();
    const result = await r;
    expect(result.total).toBe(2);
    expect(result.completed).toBe(2);
  });

  it("broadcasts layout exactly once per slide (no flicker)", async () => {
    const readyEvents: any[] = [];
    const r = runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }] } as any,
      settings: { llm: { baseUrl: "https://x", apiKey: "sk-fake", model: "test-model" } } as any,
      cwd: workDir,
      onSlideReady: (slide) => readyEvents.push(slide),
    });
    await new Promise((res) => setTimeout(res, 20));
    completeAll();
    await r;
    const layouts = readyEvents.filter((e) => e.id === "s1" && e.status === "layout");
    expect(layouts).toHaveLength(1);
  });

  it("validation passes → broadcasts done with html from disk", async () => {
    const readyEvents: any[] = [];
    const r = runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }] } as any,
      settings: { llm: { baseUrl: "https://x", apiKey: "sk-fake", model: "test-model" } } as any,
      cwd: workDir,
      onSlideReady: (slide) => readyEvents.push(slide),
    });
    await new Promise((res) => setTimeout(res, 20));
    completeAll();
    const result = await r;
    const s1Done = readyEvents.find((e) => e.id === "s1" && e.status === "done");
    expect(s1Done).toBeDefined();
    expect(s1Done.html).toContain("<section");
    expect(result.completed).toBe(1);
  });

  it("validation fails on first attempt → retry succeeds with feedback", async () => {
    const readyEvents: any[] = [];
    const r = runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }] } as any,
      settings: { llm: { baseUrl: "https://x", apiKey: "sk-fake", model: "test-model" } } as any,
      cwd: workDir,
      maxRetries: 2,
      onSlideReady: (slide) => readyEvents.push(slide),
    });
    await new Promise((res) => setTimeout(res, 20));
    // First dispatch: validation fails (no file written)
    const first = mockRuntime.dispatched[0];
    push(first.taskId, { type: "completed", task: { id: first.taskId, status: "completed" } });
    // Wait for retry to be dispatched
    await new Promise((res) => setTimeout(res, 30));
    // Second dispatch: succeeds
    completeAll();
    const result = await r;
    expect(mockRuntime.dispatched.length).toBe(2);  // 1 initial + 1 retry
    expect(result.completed).toBe(1);
  });

  it("validation fails on every attempt → marks failed after maxRetries", async () => {
    const readyEvents: any[] = [];
    const r = runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }] } as any,
      settings: { llm: { baseUrl: "https://x", apiKey: "sk-fake", model: "test-model" } } as any,
      cwd: workDir,
      maxRetries: 2,
      onSlideReady: (slide) => readyEvents.push(slide),
    });
    await new Promise((res) => setTimeout(res, 20));
    // Complete all currently dispatched tasks with empty html (validation will fail)
    const failAll = () => {
      for (const { taskId } of mockRuntime.dispatched) {
        if (mockRuntime.tasks.get(taskId)?.closed.v) continue;
        push(taskId, { type: "completed", task: { id: taskId, status: "completed" } });
      }
    };
    failAll();
    await new Promise((res) => setTimeout(res, 30));
    failAll();
    await new Promise((res) => setTimeout(res, 30));
    failAll();
    const result = await r;
    // 1 initial + 2 retries = 3 dispatches
    expect(mockRuntime.dispatched.length).toBe(3);
    const s1Failed = readyEvents.find((e) => e.id === "s1" && e.status === "failed");
    expect(s1Failed).toBeDefined();
    expect(s1Failed.error).toMatch(/validation failed/);
    expect(result.failed).toBe(1);
  });

  it("sub-agent task error → retries then fails", async () => {
    const readyEvents: any[] = [];
    const r = runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }] } as any,
      settings: { llm: { baseUrl: "https://x", apiKey: "sk-fake", model: "test-model" } } as any,
      cwd: workDir,
      maxRetries: 1,
      onSlideReady: (slide) => readyEvents.push(slide),
    });
    await new Promise((res) => setTimeout(res, 20));
    // First dispatch: error
    const first = mockRuntime.dispatched[0];
    push(first.taskId, { type: "failed", task: { id: first.taskId, status: "failed", error: { message: "rate limit" } } });
    await new Promise((res) => setTimeout(res, 30));
    // Retry: also fails
    for (const { taskId } of mockRuntime.dispatched) {
      if (mockRuntime.tasks.get(taskId)?.closed.v) continue;
      push(taskId, { type: "failed", task: { id: taskId, status: "failed", error: { message: "rate limit" } } });
    }
    const result = await r;
    const s1Failed = readyEvents.find((e) => e.id === "s1" && e.status === "failed");
    expect(s1Failed).toBeDefined();
    expect(s1Failed.error).toMatch(/rate limit/);
    expect(result.failed).toBe(1);
  });

  it("events stream ends without terminal event → validates disk and broadcasts done/failed", async () => {
    const readyEvents: any[] = [];
    const r = runOrchestrator({
      projectId: "p1",
      outline: { topic: "T", slides: [{ id: "s1", title: "A" }] } as any,
      settings: { llm: { baseUrl: "https://x", apiKey: "sk-fake", model: "test-model" } } as any,
      cwd: workDir,
      onSlideReady: (slide) => readyEvents.push(slide),
    });
    await new Promise((res) => setTimeout(res, 20));
    // Simulate the sub-agent writing the file BEFORE the events() stream
    // closes (i.e. the file is on disk, but the orchestrator's consumer
    // never saw the "completed" event before the stream ended).
    const taskId = Array.from(mockRuntime.tasks.keys())[0];
    mkdirSync(join(workDir, "slides"), { recursive: true });
    writeFileSync(
      join(workDir, "slides", "s1.html"),
      `<section data-layout="1">${"x".repeat(300)}</section>`,
    );
    // Force-close the events stream without pushing a terminal event.
    // The mock's queue + closed live on the task object directly.
    const task = mockRuntime.tasks.get(taskId)!;
    task.closed.v = true;
    task.queue.shift()?.resolve({ value: undefined, done: true });
    const result = await r;
    const s1Done = readyEvents.find((e) => e.id === "s1" && e.status === "done");
    expect(s1Done).toBeDefined();
    expect(s1Done.html).toContain("<section");
    expect(result.completed).toBe(1);
  });

  it("integrates without throwing on empty outline", async () => {
    mkdirSync(join(workDir, "p-empty"), { recursive: true });
    const result = await runOrchestrator({
      projectId: "p-empty",
      outline: { topic: "T", slides: [] } as any,
      settings: { llm: { baseUrl: "https://x", apiKey: "sk-fake", model: "test-model" } } as any,
      cwd: workDir,
    });
    expect(result.total).toBe(0);
    expect(result.cancelled).toBe(false);
  });
});
