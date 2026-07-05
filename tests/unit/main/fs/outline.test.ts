import { mkdtempSync, rmSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addSlide,
  backfillSlideIds,
  deleteSlide,
  readOutline,
  readSource,
  readStyle,
  updateSlide,
  writeOutline,
  writeSource,
  writeStyle,
} from "../../../../src/main/fs/outline.js";
import { setProjectsDirForTest } from "../../../../src/main/fs/paths.js";

describe("fs/outline", () => {
  let dir: string;
  let projectId: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "zn-outline-"));
    projectId = "p1";
    setProjectsDirForTest(dir);
    mkdirSync(join(dir, projectId), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("readOutline returns null when missing", async () => {
    expect(await readOutline(projectId)).toBe(null);
  });

  it("writeOutline then readOutline round-trips", async () => {
    const outline = {
      slides: [{ id: "s1", title: "T", bullets: ["b1", "b2"] }],
      generatedAt: 1000,
    };
    await writeOutline(projectId, outline);
    expect(await readOutline(projectId)).toEqual(outline);
  });

  it("readSource/writeSource work", async () => {
    expect(await readSource(projectId)).toBe("");
    await writeSource(projectId, "hello world");
    expect(await readSource(projectId)).toBe("hello world");
  });

  it("readStyle returns DEFAULT_STYLE when missing", async () => {
    const s = await readStyle(projectId);
    expect(s.primaryColor).toBe("#FF6600");
  });

  it("writeStyle then readStyle round-trips", async () => {
    await writeStyle(projectId, { primaryColor: "#ff0000", layout: "fullbg", fontFamily: "serif" });
    expect((await readStyle(projectId)).primaryColor).toBe("#ff0000");
  });

  it("updateSlide patches one slide", async () => {
    await writeOutline(projectId, {
      slides: [{ id: "s1", title: "A", bullets: ["x"] }],
      generatedAt: 1,
    });
    const updated = await updateSlide(projectId, "s1", { title: "B" });
    expect(updated.slides[0].title).toBe("B");
    expect(updated.slides[0].bullets).toEqual(["x"]);
  });

  it("addSlide appends with new uuid", async () => {
    await writeOutline(projectId, { slides: [], generatedAt: 1 });
    const r = await addSlide(projectId);
    expect(r.slides).toHaveLength(1);
    expect(r.slides[0].title).toBe("新幻灯片");
  });

  it("deleteSlide removes by id", async () => {
    await writeOutline(projectId, {
      slides: [
        { id: "s1", title: "A", bullets: [] },
        { id: "s2", title: "B", bullets: [] },
      ],
      generatedAt: 1,
    });
    const r = await deleteSlide(projectId, "s1");
    expect(r.slides.map((s) => s.id)).toEqual(["s2"]);
  });
});


describe("backfillSlideIds (Bug: PPT generation fails when outline has no slide ids)", () => {
  // Regression: LLM outline output has no slide.id field. The orchestrator
  // calls writeProjectSlide(id, target.id, html) where target.id is
  // undefined → "Cannot read properties of undefined (reading 'replace')".
  // STAGE_OUTLINE_GENERATE and loadSettingsAndOutline both backfill via
  // this helper.

  it("returns true and assigns a uuid when an id is missing", () => {
    const slides = [{ title: "T", bullets: [] } as any];
    const changed = backfillSlideIds(slides);
    expect(changed).toBe(true);
    expect(slides[0].id).toBeTruthy();
    expect(typeof slides[0].id).toBe("string");
    expect(slides[0].id.length).toBeGreaterThan(20); // uuid
  });

  it("returns false when every slide already has an id (idempotent)", () => {
    const slides = [
      { id: "s1", title: "A", bullets: [] },
      { id: "s2", title: "B", bullets: [] },
    ];
    const changed = backfillSlideIds(slides);
    expect(changed).toBe(false);
    expect(slides.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("only fills the missing entries; existing ids are preserved", () => {
    const slides = [
      { id: "existing", title: "A", bullets: [] },
      { title: "B", bullets: [] } as any, // missing
      { id: "also-existing", title: "C", bullets: [] },
      { title: "D", bullets: [] } as any, // missing
    ];
    const changed = backfillSlideIds(slides);
    expect(changed).toBe(true);
    expect(slides[0].id).toBe("existing");
    expect(slides[2].id).toBe("also-existing");
    expect(typeof slides[1].id).toBe("string");
    expect(typeof slides[3].id).toBe("string");
    expect(slides[1].id).not.toBe(slides[3].id);
  });

  it("mutates the array in place (matches the read-side usage)", () => {
    const slides = [{ title: "x" } as any];
    const ref = slides;
    backfillSlideIds(slides);
    expect(slides).toBe(ref);
    expect(slides[0].id).toBeTruthy();
  });

  it("handles empty arrays", () => {
    const slides: any[] = [];
    expect(backfillSlideIds(slides)).toBe(false);
  });
});
