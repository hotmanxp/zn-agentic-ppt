/**
 * Regression: vendored SDK throws "Cannot read properties of undefined
 * (reading 'safeParse')" when its internal agent validator references
 * a tool the SDK didn't load (e.g. NotebookRead). Before this fix,
 * the STAGE_SLIDE_REGENERATE IPC handler propagated the throw, which
 * surfaced to the renderer as an "unhandled promise rejection" with
 * a confusing stack trace. After the fix, the handler catches the
 * throw and returns {phase: 'error', error: '<message>'} so the
 * renderer's toast handler can surface a clean error to the user.
 *
 * We exercise the handler at the unit level by mocking the runner
 * to throw, then assert the handler returns a clean error envelope.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock state needs to be hoisted so the vi.mock factory closures
// (which run before the rest of the module) can see it.
const mocks = vi.hoisted(() => {
  return {
    runnerCtorSpy: vi.fn(),
    runner: { run: vi.fn(), interrupt: vi.fn() },
    fsOutline: {
      readOutline: vi.fn(),
      writeOutline: vi.fn(),
      updateSlide: vi.fn(),
      addSlide: vi.fn(),
      deleteSlide: vi.fn(),
      backfillSlideIds: vi.fn(() => false),
      readSource: vi.fn(),
      readStyle: vi.fn(),
      writeStyle: vi.fn(),
    },
    fsProjects: {
      getProject: vi.fn(),
      writeProjectBrief: vi.fn(),
      writeProjectSlide: vi.fn(),
      writeProjectHtml: vi.fn(),
      clearProjectSlides: vi.fn(),
      setProjectStatus: vi.fn(),
      updateProject: vi.fn(),
      writeProjectFramework: vi.fn(),
      readProjectSlide: vi.fn(),
      listProjectSlides: vi.fn(),
    },
    fsSettings: { getSettings: vi.fn(), getPromptOverride: vi.fn() },
    ipcHandlers: new Map(),
  };
});

vi.mock("../../../../src/main/sdk/runner.js", () => ({
  GenerationRunner: class {
    constructor(opts: any) {
      mocks.runnerCtorSpy(opts);
      return mocks.runner;
    }
  },
}));
vi.mock("../../../../src/main/fs/outline.js", () => mocks.fsOutline);
vi.mock("../../../../src/main/fs/projects.js", () => mocks.fsProjects);
vi.mock("../../../../src/main/fs/settings.js", () => mocks.fsSettings);
vi.mock("../../../../src/shared/ipc-channels.js", () => ({
  IPC: {
    STAGE_COLLECT_SAVE: "stage:collect-save",
    STAGE_OUTLINE_GENERATE: "stage:outline-generate",
    STAGE_OUTLINE_READ: "stage:outline-read",
    STAGE_OUTLINE_UPDATE: "stage:outline-update",
    STAGE_SLIDE_ADD: "stage:slide-add",
    STAGE_SLIDE_DELETE: "stage:slide-delete",
    STAGE_SLIDE_REGENERATE: "stage:slide-regenerate",
    STAGE_OUTLINE_CANCEL: "stage:outline-cancel",
    STAGE_SLIDE_CANCEL: "stage:slide-cancel",
    STAGE_HTML_GENERATE: "stage:html-generate",
    STAGE_HTML_CANCEL: "stage:html-cancel",
    STAGE_LAYOUT_GENERATE: "stage:layout-generate",
    STAGE_STYLE_SAVE: "stage:style-save",
    STAGE_OUTLINE_STREAM: "stage:outline-stream",
    STAGE_SLIDE_REGENERATE_STREAM: "stage:slide-regenerate-stream",
    STAGE_HTML_SLIDE_READY: "stage:html-slide-ready",
    STAGE_HTML_GENERATE_DONE: "stage:html-generate-done",
    HTML_SLIDE_UPDATED: "html-slide-updated",
  },
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockRejectedValue({ code: "ENOENT" }),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  rm: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("node:path", () => ({
  join: (...parts: string[]) => parts.join("/"),
  dirname: (p: string) => p.split("/").slice(0, -1).join("/"),
}));
vi.mock("node:crypto", () => ({ randomUUID: () => "test-uuid" }));
vi.mock("electron", () => ({
  ipcMain: { handle: (channel: string, handler: any) => mocks.ipcHandlers.set(channel, handler) },
  BrowserWindow: { getAllWindows: () => [] },
}));

import { registerStageIPC } from "../../../../src/main/ipc/stage.js";
import { registry } from "../../../../src/main/ipc/stage-stream-registry.js";
import { join } from "node:path";

beforeEach(() => {
  mocks.ipcHandlers.clear();
  registry.reset();
  mocks.runner.run.mockReset();
  mocks.runner.interrupt.mockReset();
  mocks.runnerCtorSpy.mockClear();
  // Default mocks for the happy setup
  mocks.fsOutline.readOutline.mockResolvedValue({
    slides: [
      { id: "s1", title: "A", bullets: [], notes: "", layout: "list" },
    ],
    generatedAt: 1,
  });
  mocks.fsSettings.getSettings.mockResolvedValue({ llm: { provider: "anthropic", baseUrl: "", apiKey: "k", model: "m" } });
  mocks.fsProjects.getProject.mockResolvedValue({ id: "p1" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("STAGE_SLIDE_REGENERATE — safeParse error handling", () => {
  it("returns {phase: 'error', error: <msg>} when runner.run() throws the SDK safeParse error", async () => {
    // Make runner.run() throw the actual vendored SDK error.
    const safeParseError = new TypeError("Cannot read properties of undefined (reading 'safeParse')");
    mocks.runner.run.mockRejectedValue(safeParseError);
    registerStageIPC();
    const handler = mocks.ipcHandlers.get("stage:slide-regenerate");
    expect(handler).toBeDefined();
    const result = await (mocks.ipcHandlers.get("stage:slide-regenerate")!)({}, { id: "p1", slideId: "s1" });
    expect(result.phase).toBe("error");
    expect(result.error).toMatch(/safeParse/);
  });

  it("returns {phase: 'cancelled'} when the runner finishes without throwing and the registry says cancelled", async () => {
    mocks.runner.run.mockResolvedValue(undefined);
    registerStageIPC();
    const handler = mocks.ipcHandlers.get("stage:slide-regenerate");
    registry.register("p1:s1", mocks.runner as any, "slide-regen");
    registry.markCancelled("p1:s1");
    const result = await (mocks.ipcHandlers.get("stage:slide-regenerate")!)({}, { id: "p1", slideId: "s1" });
    expect(result.phase).toBe("cancelled");
  });

  it("returns {phase: 'done'} when the runner finishes successfully", async () => {
    mocks.runner.run.mockResolvedValue(undefined);
    registerStageIPC();
    const handler = mocks.ipcHandlers.get("stage:slide-regenerate");
    const result = await (mocks.ipcHandlers.get("stage:slide-regenerate")!)({}, { id: "p1", slideId: "s1" });
    expect(result.phase).toBe("done");
  });

  it("unregisters the runner from the registry on safeParse error (no leak)", async () => {
    mocks.runner.run.mockRejectedValue(
      new TypeError("Cannot read properties of undefined (reading 'safeParse')"),
    );
    registerStageIPC();
    const handler = mocks.ipcHandlers.get("stage:slide-regenerate");
    await (mocks.ipcHandlers.get("stage:slide-regenerate")!)({}, { id: "p1", slideId: "s1" });
    // After the error, the runner should no longer be in the registry.
    // `cancel()` returns false for unknown keys.
    expect(registry.cancel("p1:s1")).toBe(false);
  });
});
