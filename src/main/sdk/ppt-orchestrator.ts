import type { Outline, Settings } from "../../shared/types.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as projectFs from "../fs/projects.js";
import { LAYOUT_DIRECTIONS } from "./prompts/slide-user.js";
import { getBackgroundRuntime, hasBackgroundRuntime } from "./zai-agent-core/runtime/background/registry.js";

export type SlideStatus = "pending" | "layout" | "generating" | "done" | "failed";

export interface OrchestratorSlide {
  id: string;
  title: string;
  status: SlideStatus;
  layout: 1 | 2 | 3 | 4 | 5;
  html?: string;
  error?: string;
  durationMs?: number;
  retries?: number;
}

export interface OrchestratorOptions {
  projectId: string;
  outline: Outline;
  settings: Settings;
  style?: unknown;
  cwd: string;
  concurrency?: number;
  maxRetries?: number;
  onSlideReady?: (slide: OrchestratorSlide) => void | Promise<void>;
  onProgress?: (info: {
    completed: number;
    total: number;
    slideId: string;
    status: SlideStatus;
  }) => void;
  signal?: AbortSignal;
}

export interface OrchestratorResult {
  completed: number;
  failed: number;
  total: number;
  cancelled: boolean;
}

const DEFAULT_MAX_RETRIES = 2;

function numericLayout(slide: { layout?: string }, index: number): 1 | 2 | 3 | 4 | 5 {
  if (slide.layout === "cover") return 1;
  if (slide.layout === "list") return 2;
  if (slide.layout === "columns") return 3;
  if (slide.layout === "stats") return 4;
  if (slide.layout === "quote" || slide.layout === "closing") return 5;
  return ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}

interface SlideTaskMeta {
  slideId: string;
  retry: number;
}

interface TaskEventLike {
  type?: string;
  task?: { id?: string; status?: string; metadata?: SlideTaskMeta & Record<string, unknown>; error?: { message?: string } };
  event?: { type?: string; data?: unknown };
}

interface SlideState {
  status: SlideStatus;
  html?: string;
  error?: string;
  layout: 1 | 2 | 3 | 4 | 5;
  dispatchCount: number;
  retries: number;
  taskId?: string;
}

const SUB_AGENT_PROMPT = (slideId: string, retryFeedback?: string): string => {
  const base = `Read the file \`tasks/${slideId}.md\` for your full task context (title, bullets, notes, layout, neighbour slides, global style). Then use the Write tool to write \`slides/${slideId}.html\` containing a single \`<section data-layout="N">…</section>\` element for this slide. Visual rules are spelled out in the task file — follow them strictly (16:9, 960×540, inline styles, position:absolute for decorations).

After writing, use Read to re-read your output and self-check: \`<section>\` element present, \`data-layout\` attribute correct, length > 200 characters, structure well-formed. If any check fails, use Edit to fix. Up to 3 self-iterations. When done, output a one-line summary.`;
  return retryFeedback ? `${base}\n\n[Previous attempt failed]\n${retryFeedback}\nPlease fix these issues and rewrite \`slides/${slideId}.html\`.` : base;
};

/**
 * Write the per-slide task file the sub-agent will read. All the
 * per-slide context (title, bullets, notes, layout, neighbours, style)
 * goes here so the parent's user message stays small (~200 token).
 */
async function writeTaskFile(
  cwd: string,
  slide: Outline["slides"][number],
  index: number,
  outline: Outline,
  style: unknown,
): Promise<void> {
  const layout = numericLayout(slide, index);
  const neighbourIds = [
    outline.slides[index - 1]?.id,
    outline.slides[index + 1]?.id,
  ].filter(Boolean) as string[];
  const neighbourPaths = neighbourIds.map((id) => `slides/${id}.html`);
  const bullets = (slide.bullets ?? [])
    .map((b, j) => `${j + 1}. ${b}`)
    .join("\n");
  const md = [
    `# Slide ${slide.id}`,
    ``,
    `## Title`,
    slide.title,
    ``,
    `## Bullets`,
    bullets || "(none)",
    ``,
    `## Notes`,
    slide.notes || "(none)",
    ``,
    `## Layout`,
    `Layout ${layout} — ${LAYOUT_DIRECTIONS[layout - 1] ?? ""}`,
    ``,
    `## Neighbour slides (Read for style consistency)`,
    neighbourPaths.length > 0 ? neighbourPaths.join("\n") : "(no neighbours — this is the only slide)",
    ``,
    `## Global style`,
    "```json",
    JSON.stringify(style ?? {}, null, 2),
    "```",
  ].join("\n");
  await writeFile(join(cwd, "tasks", `${slide.id}.md`), md, "utf8");
}

async function readSlideHtml(cwd: string, slideId: string): Promise<string | null> {
  try {
    return await readFile(join(cwd, "slides", `${slideId}.html`), "utf8");
  } catch {
    return null;
  }
}

interface ValidationResult {
  ok: boolean;
  reasons: string[];
}

/**
 * Mechanical 6-condition check, mirrors the parent's old LLM-driven
 * validation. Runs in microseconds — no LLM call.
 */
async function validateSlide(cwd: string, slideId: string, expectedLayout: 1 | 2 | 3 | 4 | 5): Promise<ValidationResult> {
  const reasons: string[] = [];
  const html = await readSlideHtml(cwd, slideId);
  if (!html) {
    reasons.push("file missing or empty");
    return { ok: false, reasons };
  }
  if (!html.includes("<section")) reasons.push("missing <section> element");
  const dlMatch = html.match(/data-layout=["'](\d)["']/);
  if (!dlMatch) reasons.push("missing data-layout attribute");
  else if (Number(dlMatch[1]) !== expectedLayout) {
    reasons.push(`data-layout=${dlMatch[1]} (expected ${expectedLayout})`);
  }
  if (html.length < 200) reasons.push(`html too short (${html.length} chars, need > 200)`);
  // Cheap structural check: open/close tag balance
  const openCount = (html.match(/<section\b/g) ?? []).length;
  const closeCount = (html.match(/<\/section>/g) ?? []).length;
  if (openCount !== closeCount) reasons.push(`<section> tag mismatch (${openCount} open vs ${closeCount} close)`);
  return { ok: reasons.length === 0, reasons };
}

/**
 * P1-4 + BackgroundRuntime: drop the parent LLM. Main process dispatches
 * every slide directly via BackgroundRuntime, listens to per-task events,
 * runs mechanical validation, and retries up to `maxRetries` times
 * before giving up. No more parent-LLM roundtrip overhead.
 */
export async function runOrchestrator(opts: OrchestratorOptions): Promise<OrchestratorResult> {
  const total = opts.outline.slides.length;
  const maxRetries = Math.max(0, opts.maxRetries ?? DEFAULT_MAX_RETRIES);

  // 1. Write framework HTML so the renderer can fetch slides/<id>.html.
  const frameworkHtml = `<!DOCTYPE html><html><head><title>${opts.outline.slides[0]?.title ?? "Presentation"}</title></head><body><main id="slides"></main></body></html>`;
  await projectFs.writeProjectFramework(opts.projectId, frameworkHtml);

  // 2. Write per-slide task files (the heavy context the sub-agent reads).
  await mkdir(join(opts.cwd, "tasks"), { recursive: true });
  await mkdir(join(opts.cwd, "slides"), { recursive: true });
  await Promise.all(
    opts.outline.slides.map((s, i) =>
      writeTaskFile(opts.cwd, s, i, opts.outline, opts.style),
    ),
  );

  // 3. Get BackgroundRuntime. If absent, we can't dispatch — fail fast.
  if (!hasBackgroundRuntime()) {
    return { completed: 0, failed: total, total, cancelled: false };
  }
  const bg = getBackgroundRuntime()!;

  // 4. Per-slide state. dispatchCount is kept for symmetry with the old
  //    parent-LLM design (renderer can observe a flicker-free "layout"
  //    transition if it ever needs to); the parent-LLM emit-once contract
  //    becomes "broadcast layout on first dispatch for this slide".
  const slideState = new Map<string, SlideState>();
  const ensure = (slideId: string, layout: 1 | 2 | 3 | 4 | 5): SlideState => {
    let s = slideState.get(slideId);
    if (!s) {
      s = { status: "pending", layout, dispatchCount: 0, retries: 0 };
      slideState.set(slideId, s);
    }
    return s;
  };

  const broadcastLayout = async (slideId: string) => {
    const s = slideState.get(slideId);
    if (!s) return;
    await opts.onSlideReady?.({
      id: slideId,
      title: slideId,
      status: "layout",
      layout: s.layout,
    });
    opts.onProgress?.({ completed: 0, total, slideId, status: "layout" });
  };
  const broadcastDone = async (slideId: string, html: string) => {
    const s = slideState.get(slideId);
    if (!s) return;
    s.status = "done";
    s.html = html;
    await opts.onSlideReady?.({ id: slideId, title: slideId, status: "done", layout: s.layout, html });
  };
  const broadcastFailed = async (slideId: string, error: string) => {
    const s = slideState.get(slideId);
    if (!s) return;
    s.status = "failed";
    s.error = error;
    await opts.onSlideReady?.({ id: slideId, title: slideId, status: "failed", layout: s.layout, error });
  };

  // 5. Track all dispatched task ids so we can wait for them.
  const dispatched: Array<{ slideId: string; taskId: string; isRetry: boolean }> = [];

  // 6. Per-slide: dispatch + consume events() + validate + maybe retry.
  //    All slides run in parallel up to BackgroundRuntime's maxConcurrent.
  const runSlide = async (slideId: string, retry: number, isRetry: boolean, prevFeedback?: string): Promise<void> => {
    const layout = numericLayout(
      opts.outline.slides.find((s) => s.id === slideId) ?? {},
      opts.outline.slides.findIndex((s) => s.id === slideId),
    );
    const s = ensure(slideId, layout);
    s.retries = retry;
    s.dispatchCount++;
    if (!isRetry) await broadcastLayout(slideId);
    const task = await bg.dispatch({
      prompt: SUB_AGENT_PROMPT(slideId, prevFeedback),
      cwd: opts.cwd,
      agent: "general-purpose",
      metadata: { slideId, retry, isRetry },
    });
    dispatched.push({ slideId, taskId: task.id, isRetry });
    s.taskId = task.id;
    if (opts.signal?.aborted) return;

    // Consume the task's event stream until completion.
    for await (const ev of bg.events(task.id, undefined, opts.signal)) {
      const evt = ev as TaskEventLike;
      const t = evt?.type ?? evt?.event?.type;
      if (t === "completed") {
        const validation = await validateSlide(opts.cwd, slideId, layout);
        if (validation.ok) {
          const html = (await readSlideHtml(opts.cwd, slideId)) ?? "";
          await broadcastDone(slideId, html);
          return;
        }
        // Validation failed — retry with feedback
        if (retry < maxRetries) {
          const feedback = validation.reasons.join("; ");
          await runSlide(slideId, retry + 1, true, feedback);
        } else {
          await broadcastFailed(
            slideId,
            `validation failed after ${maxRetries} retries: ${validation.reasons.join("; ")}`,
          );
        }
        return;
      }
      if (t === "failed") {
        const errMsg = evt?.task?.error?.message ?? "sub-agent task failed";
        if (retry < maxRetries) {
          await runSlide(slideId, retry + 1, true, `sub-agent error: ${errMsg}`);
        } else {
          await broadcastFailed(slideId, `sub-agent failed after ${maxRetries} retries: ${errMsg}`);
        }
        return;
      }
      // 'queued' / 'running' / intermediate events — no action needed
    }
  };

  // 7. Kick off every slide in parallel. BackgroundRuntime caps concurrency.
  await Promise.all(
    opts.outline.slides.map((s) => runSlide(s.id, 0, false)),
  );

  // 8. Tally final state.
  let completed = 0;
  let failed = 0;
  for (const s of slideState.values()) {
    if (s.status === "done") completed++;
    else if (s.status === "failed") failed++;
  }
  return { completed, failed, total, cancelled: !!opts.signal?.aborted };
}
