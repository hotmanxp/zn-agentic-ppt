import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let workDir: string;
let prevDataDir: string | undefined;
let mockRunResult: { html: string; durationMs: number };

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "stage-intent-test-"));
  prevDataDir = process.env.ZN_AGENTIC_PPT_TEST_DATA_DIR;
  process.env.ZN_AGENTIC_PPT_TEST_DATA_DIR = workDir;
  mockRunResult = { html: "", durationMs: 0 };
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.resetModules();
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  if (prevDataDir === undefined) delete process.env.ZN_AGENTIC_PPT_TEST_DATA_DIR;
  else process.env.ZN_AGENTIC_PPT_TEST_DATA_DIR = prevDataDir;
  vi.restoreAllMocks();
});

const validIntentJson = JSON.stringify({
  audience: { profile: "B2B buyer", expertise: "熟手", concerns: ["ROI"] },
  goal_decomposition: { primary: "Convince", secondary: [] },
  tone: "professional",
  constraints: { duration: "20 分钟", pages: 10, language: "zh-CN" },
  must_cover_points: ["value"],
  forbidden: [],
  narrative_arc: "A→B",
});

async function loadStageWithMockRunner() {
  vi.doMock("electron", () => ({
    BrowserWindow: { getAllWindows: () => [] },
    ipcMain: { handle: () => {} },
  }));
  vi.doMock("../../../../src/main/sdk/runner.js", () => ({
    GenerationRunner: class {
      constructor(public opts: any) {}
      async run() {
        mockRunResult.durationMs = 1;
        this.opts.onDone?.(mockRunResult);
      }
      interrupt() {}
    },
  }));
  vi.doMock("../../../../src/main/fs/projects.js", () => ({
    getProject: async () => ({ id: "p1", topic: "t", brief: { markdown: "# brief" } }),
  }));
  vi.doMock("../../../../src/main/fs/settings.js", () => ({
    getSettings: async () => ({}),
    getPromptOverride: async () => null,
  }));
  vi.doMock("../../../../src/main/ipc/stage-stream-registry.js", () => ({
    registry: {
      register: () => {},
      unregister: () => {},
      isCancelled: () => false,
    },
  }));
}

describe("generateIntent (via stage.ts)", () => {
  test("writes intent.json on success", async () => {
    mockRunResult.html = validIntentJson;
    await loadStageWithMockRunner();
    const { generateIntent } = await import("../../../../src/main/ipc/stage.js");
    const result = await generateIntent("p1");
    expect(result.phase).toBe("done");
    expect(result.intent?.constraints.pages).toBe(10);
    const { readIntent } = await import("../../../../src/main/fs/intent.js");
    const disk = await readIntent("p1");
    expect(disk?.tone).toBe("professional");
  });

  test("throws and writes nothing on invalid JSON", async () => {
    mockRunResult.html = "not json";
    await loadStageWithMockRunner();
    const { generateIntent } = await import("../../../../src/main/ipc/stage.js");
    await expect(generateIntent("p1")).rejects.toThrow(/JSON/);
    const { readIntent } = await import("../../../../src/main/fs/intent.js");
    expect(await readIntent("p1")).toBeNull();
  });
});