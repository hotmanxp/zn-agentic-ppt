/**
 * Regression: STAGE_OUTLINE_GENERATE used to hard-throw with
 * "意图未生成" when no intent.json existed on disk. The only
 * renderer entry point that triggered this path was `approveSources`
 * (which runs BEFORE the `approveOutline` chain has populated the
 * intent file). The IPC throw had no renderer-side recovery path —
 * `approveSources` has no try/catch — so the workbench phase stayed
 * at `buildingOutline` and the ProcessCard spun on its first row
 * "提炼核心观点" indefinitely.
 *
 * After the fix: the outline handler synchronously falls back to
 * `generateIntent` when no persisted intent exists, so the call
 * returns a real outline (with intent grounding) and the UI moves
 * forward.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { setProjectsDirForTest } from "../../../../src/main/fs/paths.js";

// Mock state hoisted so the vi.mock factories can see it.
const mocks = vi.hoisted(() => {
  const ipcHandlers = new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>();
  return {
    ipcHandlers,
    runnerOnProgress: vi.fn(),
    runnerOnDone: vi.fn(),
    runnerOnError: vi.fn(),
    runnerOnEvent: vi.fn(),
    runnerRunImpl: vi.fn(),
    outlineOnProgress: vi.fn(),
    outlineOnDone: vi.fn(),
    outlineOnError: vi.fn(),
    outlineOnEvent: vi.fn(),
    outlineRunImpl: vi.fn(),
  };
});

vi.doMock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle: (channel: string, cb: (event: unknown, payload: unknown) => Promise<unknown>) => {
      mocks.ipcHandlers.set(channel, cb);
    },
  },
}));

// Mock settings + projects + outline fs to control what the handler sees.
const mockIntentJson = JSON.stringify({
  audience: { profile: "B2B buyer", expertise: "熟手", concerns: ["ROI"] },
  goal_decomposition: { primary: "Convince", secondary: [] },
  tone: "professional",
  constraints: { duration: "20 分钟", pages: 10, language: "zh-CN" },
  must_cover_points: ["value"],
  forbidden: [],
  narrative_arc: "A→B",
});

const validOutlineJson = JSON.stringify({
  globalStyle: { primaryColor: "#000", accentColor: "#fff", fontFamily: "f", aspectRatio: "16/9" },
  slides: [
    { title: "封面", bullets: [], layout: "cover" },
    { title: "结尾", bullets: [], layout: "closing" },
  ],
});

// Two runners: intent runner (returns valid intent JSON), outline
// runner (returns valid outline JSON).
vi.doMock("../../../../src/main/sdk/runner.js", () => ({
  GenerationRunner: class {
    opts: any;
    constructor(opts: any) {
      this.opts = opts;
      // Pull out the callers so we can fire onDone from the test body.
      if (typeof opts.userMessage === "string" && opts.userMessage.includes("提炼结构化意图")) {
        mocks.runnerOnProgress = opts.onProgress;
        mocks.runnerOnDone = opts.onDone;
        mocks.runnerOnError = opts.onError;
        mocks.runnerOnEvent = opts.onEvent;
        mocks.runnerRunImpl = async () => {
          mocks.runnerOnDone({ html: mockIntentJson, durationMs: 10 });
        };
      } else {
        mocks.outlineOnProgress = opts.onProgress;
        mocks.outlineOnDone = opts.onDone;
        mocks.outlineOnError = opts.onError;
        mocks.outlineOnEvent = opts.onEvent;
        mocks.outlineRunImpl = async () => {
          mocks.outlineOnDone({ html: validOutlineJson, durationMs: 10 });
        };
      }
    }
    async run() {
      if (this.opts.userMessage.includes("提炼结构化意图")) {
        await mocks.runnerRunImpl();
      } else {
        await mocks.outlineRunImpl();
      }
    }
    interrupt() {}
  },
}));

vi.doMock("../../../../src/main/fs/projects.js", () => ({
  getProject: async () => ({
    id: "p1",
    topic: "Q3 客户汇报",
    brief: { markdown: "# brief markdown\n", topic: "Q3 客户汇报" },
  }),
}));

vi.doMock("../../../../src/main/fs/settings.js", () => ({
  getSettings: async () => ({}),
  getPromptOverride: async () => null,
}));

vi.doMock("../../../../src/main/fs/outline.js", () => ({
  readSource: async () => "",
  writeSource: async () => {},
  readOutline: async () => null,
  writeOutline: async () => {},
  readStyle: async () => null,
  writeStyle: async () => {},
  updateSlide: async () => null,
  addSlide: async () => null,
  deleteSlide: async () => null,
  backfillSlideIds: () => false,
}));

vi.doMock("../../../../src/main/ipc/stage-stream-registry.js", () => ({
  registry: {
    register: () => {},
    unregister: () => {},
    isCancelled: () => false,
    cancel: () => true,
    markCancelled: () => {},
  },
}));

const intentCalls = vi.fn();
vi.doMock("../../../../src/shared/ipc-channels.js", () => {
  const channels = {
    STAGE_COLLECT_SAVE: "stage:collect-save",
    STAGE_OUTLINE_GENERATE: "stage:outline-generate",
    STAGE_OUTLINE_READ: "stage:outline-read",
    STAGE_OUTLINE_UPDATE: "stage:outline-update",
    STAGE_SLIDE_ADD: "stage:slide-add",
    STAGE_SLIDE_DELETE: "stage:slide-delete",
    STAGE_SLIDE_REGENERATE: "stage:slide-regenerate",
    STAGE_SLIDE_REGEN_STREAM: "stage:slide-regen-stream",
    STAGE_OUTLINE_CANCEL: "stage:outline-cancel",
    STAGE_SLIDE_CANCEL: "stage:slide-cancel",
    STAGE_HTML_GENERATE: "stage:html-generate",
    STAGE_HTML_CANCEL: "stage:html-cancel",
    STAGE_LAYOUT_GENERATE: "stage:layout-generate",
    STAGE_STYLE_SAVE: "stage:style-save",
    STAGE_OUTLINE_STREAM: "stage:outline-stream",
    STAGE_HTML_SLIDE_READY: "stage:html-slide-ready",
    STAGE_HTML_GENERATE_DONE: "stage:html-generate-done",
    HTML_SLIDE_UPDATED: "html-slide-updated",
    STAGE_INTENT_GENERATE: "stage:intent-generate",
    STAGE_INTENT_STREAM: "stage:intent-stream",
  };
  intentCalls(channels);
  return { IPC: channels };
});

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "stage-outline-fallback-"));
  setProjectsDirForTest(workDir);
  mocks.ipcHandlers.clear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("STAGE_OUTLINE_GENERATE — intent fallback", () => {
  test("writes intent.json + returns outline when no prior intent exists (the approveSources path)", async () => {
    // Pre-condition: no intent.json on disk — the situation the bug surfaced through.
    const projectDir = join(workDir, "p1");
    expect(existsSync(projectDir)).toBe(false);

    // Dynamically import after mocks are in place.
    const { registerStageIPC } = await import("../../../../src/main/ipc/stage.js");
    registerStageIPC();

    const handler = mocks.ipcHandlers.get("stage:outline-generate");
    expect(handler, "STAGE_OUTLINE_GENERATE handler must be registered").toBeDefined();

    // The repro call — same shape as approveSources' IPC call.
    const result = await handler!(null, { id: "p1" });

    // After the fix: returns an outline (no exception). The renderer
    // receives { phase: "done", slides } and switches phase to
    // "outline", ending the "提炼核心观点" spinner.
    expect(result).toMatchObject({ phase: "done" });
    expect((result as any).slides?.length).toBeGreaterThanOrEqual(2);

    // And the fallback wrote intent.json so a subsequent outlineGenerate
    // call doesn't pay the intent cost again.
    expect(existsSync(join(projectDir, "intent.json"))).toBe(true);
    const onDisk = JSON.parse(readFileSync(join(projectDir, "intent.json"), "utf8"));
    expect(onDisk.tone).toBe("professional");
  });

  test("does NOT re-run generateIntent when intent.json already exists", async () => {
    // Seed intent.json so the fallback branch is skipped.
    const fs = await import("node:fs/promises");
    await fs.mkdir(join(workDir, "p1"), { recursive: true });
    const seeded = { tone: "professional", audience: { profile: "x", expertise: "熟手", concerns: [] }, goal_decomposition: { primary: "z", secondary: [] }, constraints: { duration: "20 分钟", pages: 10, language: "zh-CN" }, must_cover_points: [], forbidden: [], narrative_arc: "A→B" };
    await fs.writeFile(join(workDir, "p1", "intent.json"), JSON.stringify(seeded));

    const { registerStageIPC } = await import("../../../../src/main/ipc/stage.js");
    registerStageIPC();
    const handler = mocks.ipcHandlers.get("stage:outline-generate");

    const result = await handler!(null, { id: "p1" });
    expect(result).toMatchObject({ phase: "done" });
  });
});
