import type { Outline, Settings, SlideLayoutKind } from "../../shared/types.js";
import * as projectFs from "../fs/projects.js";
import { generateFrameworkHtml, generateLayoutHtml, layoutForIndex } from "./ppt-framework.js";
import { renderPrompt } from "./prompts/index.js";
import { LAYOUT_DIRECTIONS } from "./prompts/slide-user.js";
import { GenerationRunner } from "./runner.js";

/**
 * Maps the outline's semantic layout hint (`cover`/`list`/...) to the
 * orchestrator's numeric layout (1-5) used for visual style. When the
 * outline didn't set a hint, fall back to cycling 1-5 by index so we
 * always have a value.
 */
function numericLayout(slide: { layout?: SlideLayoutKind }, index: number): 1 | 2 | 3 | 4 | 5 {
  if (slide.layout === "cover") return 1;
  if (slide.layout === "list") return 2;
  if (slide.layout === "columns") return 3;
  if (slide.layout === "stats") return 4;
  if (slide.layout === "quote" || slide.layout === "closing") return 5;
  return layoutForIndex(index);
}

export type SlideStatus = "pending" | "layout" | "generating" | "done" | "failed";

export interface OrchestratorSlide {
  id: string;
  title: string;
  status: SlideStatus;
  /** 1-5: which visual layout template the LLM was instructed to use. */
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

/**
 * Drives the multi-slide PPT generation pipeline:
 *  1. Writes framework index.html (loads slides via fetch + DOM injection)
 *  2. Spawns a worker pool of N concurrent LLM calls (one per slide)
 *  3. On each slide completion, writes slides/<id>.html and fires onSlideReady
 *  4. Failed slides retry up to maxRetries times; persistent failures are
 *     marked 'failed' but don't stop other slides
 */
export async function runOrchestrator(opts: OrchestratorOptions): Promise<OrchestratorResult> {
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const maxRetries = Math.max(0, opts.maxRetries ?? 2);

  const slides: OrchestratorSlide[] = opts.outline.slides.map((s, i) => ({
    id: s.id,
    title: s.title,
    status: "pending",
    layout: numericLayout(s, i),
  }));
  const total = slides.length;

  // Step 1: write the framework HTML up front
  const frameworkHtml = generateFrameworkHtml({
    topic: opts.outline.slides[0]?.title ?? "Presentation",
    slides: opts.outline.slides.map((s, i) => ({
      id: s.id,
      title: s.title,
      layout: numericLayout(s, i),
    })),
  });
  await projectFs.writeProjectFramework(opts.projectId, frameworkHtml);

  // Step 1b: write N layout placeholders immediately (no LLM)
  // so the user sees structure while the LLM fills content.
  for (let i = 0; i < opts.outline.slides.length; i++) {
    const target = opts.outline.slides[i];
    const layoutHtml = generateLayoutHtml(target);
    await projectFs.writeProjectSlide(opts.projectId, target.id, layoutHtml);
    const slide = slides.find((s) => s.id === target.id)!;
    slide.status = "layout";
    slide.html = layoutHtml;
    await opts.onSlideReady?.(slide);
    opts.onProgress?.({ completed: 0, total, slideId: target.id, status: "layout" });
  }

  // Step 2: simple worker pool
  let completed = 0;
  let failed = 0;
  let cancelled = false;
  const next = (): OrchestratorSlide | undefined => {
    if (opts.signal?.aborted) return undefined;
    return slides.find((s) => s.status === "pending" || s.status === "layout");
  };

  const onProgress = (slide: OrchestratorSlide) => {
    opts.onProgress?.({
      completed,
      total,
      slideId: slide.id,
      status: slide.status,
    });
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(
      (async () => {
        while (!opts.signal?.aborted) {
          const slide = next();
          if (!slide) return;
          slide.status = "generating";
          onProgress(slide);
          const target = opts.outline.slides.find((s) => s.id === slide.id)!;
          const others = opts.outline.slides
            .filter((s) => s.id !== slide.id)
            .map((s) => ({ id: s.id, title: s.title }));
          const slideIndex = opts.outline.slides.findIndex((s) => s.id === slide.id) + 1;
          // System prompt: persona + hard rules + deck-wide palette/font.
          // Per-slide context (cwd, slide index, file paths) goes in the
          // user prompt so the system prompt stays static across turns.
          const systemPrompt = await renderPrompt("SLIDE_SYSTEM_PROMPT", {
            "globalStyle.primaryColor": opts.outline.globalStyle?.primaryColor ?? "",
            "globalStyle.accentColor": opts.outline.globalStyle?.accentColor ?? "",
            "globalStyle.fontFamily": opts.outline.globalStyle?.fontFamily ?? "",
            "globalStyle.aspectRatio": opts.outline.globalStyle?.aspectRatio ?? "",
          });
          const targetBullets = (target.bullets ?? []).map((b, i) => `  ${i + 1}. ${b}`).join("\n");
          const targetNotes = target.notes ? `备注: ${target.notes}` : "";
          const othersTitles = others.map((o) => `- ${o.title}`).join("\n");
          const styleBlock = opts.style
            ? `【全局样式参数】\n${JSON.stringify(opts.style, null, 2)}\n`
            : "";
          const layoutDirection = LAYOUT_DIRECTIONS[slide.layout - 1] ?? "";
          const userMessage = await renderPrompt("SLIDE_USER_PROMPT", {
            cwd: opts.cwd,
            slideIndex: slideIndex.toString(),
            totalSlides: opts.outline.slides.length.toString(),
            slideId: target.id,
            layout: slide.layout.toString(),
            "target.title": target.title,
            targetBullets,
            targetNotes,
            othersTitles,
            styleBlock,
            layoutDirection,
            "globalStyle.fontFamily": opts.outline.globalStyle?.fontFamily ?? "",
          });
          const startedAt = Date.now();

          let success = false;
          let lastError: string | null = null;
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (opts.signal?.aborted) return;
            slide.retries = attempt;
            try {
              const html = await runSingleSlide({
                cwd: opts.cwd,
                settings: opts.settings,
                systemPrompt,
                userMessage,
                runId: `${opts.projectId}:${slide.id}`,
                signal: opts.signal,
              });
              slide.html = html;
              slide.status = "done";
              slide.durationMs = Date.now() - startedAt;
              success = true;
              break;
            } catch (e: any) {
              lastError = e?.message ?? String(e);
              console.error(`[orchestrator] slide ${slide.id} attempt ${attempt + 1} FAILED:`, lastError);
              console.error(`[orchestrator] slide ${slide.id} STACK:`, e?.stack);
              if (opts.signal?.aborted) return;
              if (attempt < maxRetries) await sleep(500 * (attempt + 1));
            }
          }

          if (success) {
            completed++;
            await opts.onSlideReady?.(slide);
          } else {
            failed++;
            slide.status = "failed";
            slide.error = lastError ?? "unknown error";
            await opts.onSlideReady?.(slide);
          }
          onProgress(slide);
        }
      })(),
    );
  }

  await Promise.all(workers);
  cancelled = !!opts.signal?.aborted;

  return { completed, failed, total, cancelled };
}

async function runSingleSlide(opts: {
  cwd: string;
  settings: Settings;
  systemPrompt: string;
  runId: string;
  signal?: AbortSignal;
  userMessage?: string;
  mcpServers?: Record<string, unknown>;
}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new Error("aborted"));
    const slideId = opts.runId.split(":").pop() ?? "";
    const userMsg =
      opts.userMessage ??
      `请用 Read 工具读取 slides/${slideId}.html（已存在空模板），然后用 Write 工具覆盖整个文件为新的 <section> HTML。完成后回复 "done"。`;
    const runner = new GenerationRunner({
      cwd: opts.cwd,
      topic: "",
      outline: "",
      settings: opts.settings,
      runId: opts.runId,
      systemPrompt: opts.systemPrompt,
      userMessage: userMsg,
      mcpServers: opts.mcpServers,
      onEvent: () => {},
      onProgress: () => {},
      onDone: () => {},
      onError: ({ error }) => reject(new Error(error.message)),
    });
    const onAbort = () => runner.interrupt();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    runner
      .run()
      .then(async () => {
        opts.signal?.removeEventListener("abort", onAbort);
        if (opts.signal?.aborted) return reject(new Error("aborted"));
        // Read back the file the agent wrote via the MCP tool
        const { readFile } = await import("node:fs/promises");
        const safe = slideId.replace(/[^a-zA-Z0-9_-]/g, "_");
        const path = `${opts.cwd}/slides/${safe}.html`;
        try {
          const html = await readFile(path, "utf8");
          resolve(html);
        } catch (e: any) {
          reject(new Error(`agent did not write slides/${safe}.html: ${e?.message ?? e}`));
        }
      })
      .catch(reject);
  });
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
