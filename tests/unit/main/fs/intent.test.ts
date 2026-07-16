import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IntentSummary } from "../../../../src/shared/intent.js";
import { setProjectsDirForTest } from "../../../../src/main/fs/paths.js";

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "intent-test-"));
  setProjectsDirForTest(workDir);
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("intent fs", () => {
  const sample: IntentSummary = {
    audience: { profile: "B2B buyer", expertise: "熟手", concerns: ["ROI"] },
    goal_decomposition: { primary: "Convince", secondary: ["Educate"] },
    tone: "professional",
    constraints: { duration: "20 分钟", pages: 10, language: "zh-CN" },
    must_cover_points: ["value"],
    forbidden: ["competitor names"],
    narrative_arc: "背景→痛点→方案",
  };

  test("writeIntent then readIntent round-trips", async () => {
    const { writeIntent, readIntent } = await import("../../../../src/main/fs/intent.js");
    await writeIntent("proj-1", sample);
    const got = await readIntent("proj-1");
    expect(got).toEqual(sample);
  });

  test("readIntent returns null when file missing", async () => {
    const { readIntent } = await import("../../../../src/main/fs/intent.js");
    expect(await readIntent("missing")).toBeNull();
  });

  test("intentExists reflects presence", async () => {
    const { writeIntent, intentExists } = await import("../../../../src/main/fs/intent.js");
    expect(await intentExists("proj-2")).toBe(false);
    await writeIntent("proj-2", sample);
    expect(await intentExists("proj-2")).toBe(true);
  });
});
