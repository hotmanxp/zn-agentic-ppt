import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Outline,
  ProjectBrief,
  ProjectDetail,
  ProjectMeta,
  ProjectStatus,
  StyleSettings,
} from "../../shared/types.js";
import { DEFAULT_STYLE } from "../../shared/types.js";
import { getProjectsDir } from "./paths.js";

const ALLOWED_UPDATE_KEYS = ["title", "topic", "outline"] as const;

export async function listProjects(): Promise<ProjectMeta[]> {
  const dir = getProjectsDir();
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const metas: ProjectMeta[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const raw = await readFile(join(dir, e.name, "meta.json"), "utf8");
      metas.push(JSON.parse(raw));
    } catch {
      /* skip corrupt */
    }
  }
  metas.sort((a, b) => b.updatedAt - a.updatedAt);
  return metas;
}

export async function getProject(id: string): Promise<ProjectDetail | null> {
  const dir = join(getProjectsDir(), id);
  if (!existsSync(dir)) return null;
  const metaPath = join(dir, "meta.json");
  if (!existsSync(metaPath)) return null;
  try {
    const metaRaw = await readFile(metaPath, "utf8");
    const meta = JSON.parse(metaRaw) as ProjectMeta;

    // Legacy combined HTML
    let html: string | null = null;
    let htmlSize: number | null = null;
    const htmlPath = join(dir, "index.html");
    if (existsSync(htmlPath)) {
      html = await readFile(htmlPath, "utf8");
      htmlSize = html.length;
    }

    // Stage 1: source
    let source: string | null = null;
    const sourcePath = join(dir, "source.txt");
    if (existsSync(sourcePath)) {
      source = await readFile(sourcePath, "utf8");
    }

    // Stage 1: brief
    let brief: ProjectBrief | null = null;
    const briefPath = join(dir, "brief.md");
    if (existsSync(briefPath)) {
      try {
        const markdown = await readFile(briefPath, "utf8");
        if (markdown.trim()) brief = { markdown };
      } catch {
        /* corrupt — leave null */
      }
    }

    // Stage 2: structured outline
    let structuredOutline: Outline | null = null;
    const outlineJsonPath = join(dir, "outline.json");
    if (existsSync(outlineJsonPath)) {
      try {
        structuredOutline = JSON.parse(await readFile(outlineJsonPath, "utf8"));
      } catch {
        /* corrupt — leave null */
      }
    }

    // Stage 3: style (always return; fall back to DEFAULT_STYLE)
    let style: StyleSettings = { ...DEFAULT_STYLE };
    const stylePath = join(dir, "style.json");
    if (existsSync(stylePath)) {
      try {
        style = { ...DEFAULT_STYLE, ...JSON.parse(await readFile(stylePath, "utf8")) };
      } catch {
        /* corrupt — keep defaults */
      }
    }

    // Stage 3: per-slide HTML files
    const slidesDirPath = join(dir, "slides");
    const slides: ProjectDetail["slides"] = [];
    if (existsSync(slidesDirPath)) {
      const entries = await readdir(slidesDirPath);
      for (const f of entries) {
        if (!f.endsWith(".html")) continue;
        const sid = f.replace(/\.html$/, "");
        const shtml = await readFile(join(slidesDirPath, f), "utf8");
        slides.push({ id: sid, html: shtml, status: "done" });
      }
    }

    return {
      ...meta,
      html,
      htmlSize,
      lastGeneratedAt: html ? meta.updatedAt : null,
      lastError: null,
      source,
      brief,
      structuredOutline,
      style,
      slides,
    };
  } catch {
    return null;
  }
}

export async function createProject(topic: string): Promise<ProjectMeta> {
  const id = randomUUID();
  const now = Date.now();
  const meta: ProjectMeta = {
    id,
    topic,
    title: topic.slice(0, 40) || "Untitled",
    status: "draft",
    outline: "",
    pageCount: null,
    createdAt: now,
    updatedAt: now,
    currentStage: "idle",
    hasSource: false,
    hasOutline: false,
    hasHtml: false,
  };
  const dir = join(getProjectsDir(), id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  await writeFile(join(dir, "outline.md"), "");
  return meta;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<ProjectMeta, "title" | "topic" | "outline">>,
): Promise<ProjectMeta> {
  for (const k of Object.keys(patch)) {
    if (!ALLOWED_UPDATE_KEYS.includes(k as any)) {
      throw new Error(`Field "${k}" is not allowed in updateProject`);
    }
  }
  const existing = await getProject(id);
  if (!existing) throw new Error(`Project ${id} not found`);
  const next: ProjectMeta = { ...existing, ...patch, updatedAt: Date.now() };
  await writeFile(join(getProjectsDir(), id, "meta.json"), JSON.stringify(next, null, 2));
  if (patch.outline !== undefined) {
    await writeFile(join(getProjectsDir(), id, "outline.md"), patch.outline);
  }
  return next;
}

export async function deleteProject(id: string): Promise<void> {
  await rm(join(getProjectsDir(), id), { recursive: true, force: true });
}

export async function writeProjectHtml(id: string, html: string): Promise<void> {
  const dir = join(getProjectsDir(), id);
  const tmpPath = join(dir, "index.html.tmp");
  const finalPath = join(dir, "index.html");
  await writeFile(tmpPath, html);
  await rename(tmpPath, finalPath);
  const existing = await getProject(id);
  if (existing) {
    const next: ProjectMeta = {
      ...existing,
      status: "generated" as ProjectStatus,
      updatedAt: Date.now(),
      pageCount: existing.pageCount,
    };
    await writeFile(join(dir, "meta.json"), JSON.stringify(next, null, 2));
  }
}

export async function setProjectStatus(
  id: string,
  status: ProjectStatus,
  errorMessage?: string,
): Promise<void> {
  const dir = join(getProjectsDir(), id);
  const metaPath = join(dir, "meta.json");
  const existing = await readFile(metaPath, "utf8");
  const meta = JSON.parse(existing) as ProjectMeta;
  // meta.json stores the on-disk record; lastError is a transient field
  // not on ProjectMeta per spec, so we cast to allow it.
  const next = {
    ...meta,
    status,
    lastError: errorMessage ?? null,
    updatedAt: Date.now(),
  };
  await writeFile(metaPath, JSON.stringify(next, null, 2));
}

// --- New: per-slide file layout ---

export interface SlideFile {
  id: string;
  /** Per-slide HTML content (typically a single <section>). */
  html: string;
}

function slidesDir(id: string): string {
  return join(getProjectsDir(), id, "slides");
}

export async function writeProjectFramework(id: string, html: string): Promise<void> {
  const dir = join(getProjectsDir(), id);
  const tmp = join(dir, "index.html.tmp");
  const final = join(dir, "index.html");
  await writeFile(tmp, html);
  await rename(tmp, final);
}

export async function readProjectFramework(id: string): Promise<string | null> {
  const p = join(getProjectsDir(), id, "index.html");
  if (!existsSync(p)) return null;
  return readFile(p, "utf8");
}

export async function writeProjectSlide(id: string, slideId: string, html: string): Promise<void> {
  const dir = slidesDir(id);
  await mkdir(dir, { recursive: true });
  // Sanitize: slideId is already constrained to our id format; defensive guard
  const safe = slideId.replace(/[^a-zA-Z0-9_-]/g, "_");
  await writeFile(join(dir, `${safe}.html`), html);
}

export async function readProjectSlide(id: string, slideId: string): Promise<string | null> {
  const safe = slideId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const p = join(slidesDir(id), `${safe}.html`);
  if (!existsSync(p)) return null;
  return readFile(p, "utf8");
}

export async function listProjectSlides(id: string): Promise<string[]> {
  const dir = slidesDir(id);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  return entries.filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, ""));
}

export async function clearProjectSlides(id: string): Promise<void> {
  const dir = slidesDir(id);
  if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
}

// --- Stage 1: brief ---

export async function readProjectBrief(id: string): Promise<ProjectBrief | null> {
  const p = join(getProjectsDir(), id, "brief.md");
  if (!existsSync(p)) return null;
  try {
    const markdown = await readFile(p, "utf8");
    if (!markdown.trim()) return null;
    return { markdown };
  } catch {
    return null;
  }
}

export async function writeProjectBrief(id: string, brief: ProjectBrief): Promise<void> {
  const dir = join(getProjectsDir(), id);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, "brief.md.tmp");
  const final = join(dir, "brief.md");
  await writeFile(tmp, brief.markdown);
  await rename(tmp, final);
}
