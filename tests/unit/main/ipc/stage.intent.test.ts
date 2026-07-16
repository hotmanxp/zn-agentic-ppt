import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setProjectsDirForTest } from "../../../../src/main/fs/paths.js";

let workDir: string;
let mockRunResult: { html: string; durationMs: number };
let mockProject: { id: string; topic: string; brief: { markdown: string } | null } | null;

vi.doMock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => {} },
}));
vi.doMock("../../../../src/main/sdk/runner.js", () => ({
  GenerationRunner: class {
    opts: any;
    constructor(opts: any) {
      this.opts = opts;
    }
    async run() {
      mockRunResult.durationMs = 1;
      this.opts.onDone?.(mockRunResult);
    }
    interrupt() {}
  },
}));
vi.doMock("../../../../src/main/fs/projects.js", () => ({
  getProject: async () => mockProject,
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

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "stage-intent-test-"));
  setProjectsDirForTest(workDir);
  mockRunResult = { html: "", durationMs: 0 };
  mockProject = { id: "p1", topic: "t", brief: { markdown: "# brief" } };
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
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

describe("generateIntent (via stage.ts)", () => {
  test("writes intent.json on success", async () => {
    mockRunResult.html = validIntentJson;
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
    const { generateIntent } = await import("../../../../src/main/ipc/stage.js");
    await expect(generateIntent("p1")).rejects.toThrow(/JSON/);
    const { readIntent } = await import("../../../../src/main/fs/intent.js");
    expect(await readIntent("p1")).toBeNull();
  });

  test("throws when project is missing", async () => {
    mockProject = null;
    const { generateIntent } = await import("../../../../src/main/ipc/stage.js");
    await expect(generateIntent("p1")).rejects.toThrow(/project not found/);
  });

  test("throws when brief is missing", async () => {
    mockProject = { id: "p1", topic: "t", brief: null };
    const { generateIntent } = await import("../../../../src/main/ipc/stage.js");
    await expect(generateIntent("p1")).rejects.toThrow(/请先在第一阶段填写项目信息/);
  });

  test("throws and writes nothing on Zod validation failure", async () => {
    mockRunResult.html = JSON.stringify({
      audience: { profile: "B2B buyer", expertise: "熟手", concerns: ["ROI"] },
      goal_decomposition: { primary: "Convince", secondary: [] },
      tone: "aggressive", // not in enum -> Zod will fail
      constraints: { duration: "20 分钟", pages: 10, language: "zh-CN" },
      must_cover_points: ["value"],
      forbidden: [],
      narrative_arc: "A→B",
    });
    const { generateIntent } = await import("../../../../src/main/ipc/stage.js");
    await expect(generateIntent("p1")).rejects.toThrow(/意图提炼结果不符合 schema/);
    const { readIntent } = await import("../../../../src/main/fs/intent.js");
    expect(await readIntent("p1")).toBeNull();
  });
});