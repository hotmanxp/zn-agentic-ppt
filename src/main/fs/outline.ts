import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Outline, OutlineSlide, StyleSettings } from "../../shared/types.js";
import { DEFAULT_STYLE } from "../../shared/types.js";
import { getProjectDir } from "./paths.js";

async function ensureProjectDir(id: string): Promise<string> {
  const dir = getProjectDir(id);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function readOutline(id: string): Promise<Outline | null> {
  const p = join(getProjectDir(id), "outline.json");
  try {
    return JSON.parse(await readFile(p, "utf8")) as Outline;
  } catch {
    return null;
  }
}

/**
 * Backfill missing slide ids in-place. Returns true if any ids were
 * assigned. The orchestrator / IPC layer both need every slide to have
 * an id (it's the key for HTML read/write, slide-regen prompts, and the
 * `<section data-id="...">` tag in the agent-written HTML). Legacy
 * outline.json files and bare LLM output may not have them.
 *
 * Exported for direct unit testing.
 */
export function backfillSlideIds(slides: OutlineSlide[]): boolean {
  let mutated = false;
  for (const s of slides) {
    if (!s.id) {
      s.id = randomUUID();
      mutated = true;
    }
  }
  return mutated;
}

export async function writeOutline(id: string, outline: Outline): Promise<void> {
  const dir = await ensureProjectDir(id);
  await writeFile(join(dir, "outline.json"), JSON.stringify(outline, null, 2));
}

export async function readSource(id: string): Promise<string> {
  const p = join(getProjectDir(id), "source.txt");
  try {
    return await readFile(p, "utf8");
  } catch {
    return "";
  }
}

export async function writeSource(id: string, source: string): Promise<void> {
  const dir = await ensureProjectDir(id);
  await writeFile(join(dir, "source.txt"), source);
}

export async function readStyle(id: string): Promise<StyleSettings> {
  const p = join(getProjectDir(id), "style.json");
  try {
    return { ...DEFAULT_STYLE, ...JSON.parse(await readFile(p, "utf8")) };
  } catch {
    return DEFAULT_STYLE;
  }
}

export async function writeStyle(id: string, style: StyleSettings): Promise<void> {
  const dir = await ensureProjectDir(id);
  await writeFile(join(dir, "style.json"), JSON.stringify(style, null, 2));
}

export async function updateSlide(
  id: string,
  slideId: string,
  patch: Partial<Pick<OutlineSlide, "title" | "bullets" | "notes">>,
): Promise<Outline> {
  const outline = await readOutline(id);
  if (!outline) throw new Error("outline not found");
  const idx = outline.slides.findIndex((s) => s.id === slideId);
  if (idx === -1) throw new Error(`slide ${slideId} not found`);
  outline.slides[idx] = { ...outline.slides[idx], ...patch };
  outline.generatedAt = Date.now();
  await writeOutline(id, outline);
  return outline;
}

export async function addSlide(id: string): Promise<Outline> {
  const outline = (await readOutline(id)) ?? { slides: [], generatedAt: Date.now() };
  const newSlide: OutlineSlide = { id: randomUUID(), title: "新幻灯片", bullets: [] };
  outline.slides.push(newSlide);
  outline.generatedAt = Date.now();
  await writeOutline(id, outline);
  return outline;
}

export async function deleteSlide(id: string, slideId: string): Promise<Outline> {
  const outline = await readOutline(id);
  if (!outline) throw new Error("outline not found");
  outline.slides = outline.slides.filter((s) => s.id !== slideId);
  outline.generatedAt = Date.now();
  await writeOutline(id, outline);
  return outline;
}
