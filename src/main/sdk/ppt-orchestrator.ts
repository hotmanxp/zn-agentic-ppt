import type { Outline, Settings } from "../../shared/types.js";
import * as projectFs from "../fs/projects.js";
import { renderPrompt } from "./prompts/index.js";
import { LAYOUT_DIRECTIONS } from "./prompts/slide-user.js";
import { PARENT_AGENT_TOOLS, runZaiQuery } from "./zai-bridge.js";

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

function numericLayout(slide: { layout?: string }, index: number): 1 | 2 | 3 | 4 | 5 {
  if (slide.layout === "cover") return 1;
  if (slide.layout === "list") return 2;
  if (slide.layout === "columns") return 3;
  if (slide.layout === "stats") return 4;
  if (slide.layout === "quote" || slide.layout === "closing") return 5;
  return ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}

interface SubAgentPrompt {
  slideId: string;
  prompt: string;
}

async function buildSubAgentPrompts(
  outline: Outline,
  style: unknown,
): Promise<SubAgentPrompt[]> {
  return Promise.all(
    outline.slides.map(async (s, i) => {
      const layout = numericLayout(s, i);
      const neighborIds = [
        outline.slides[i - 1]?.id,
        outline.slides[i + 1]?.id,
      ].filter(Boolean) as string[];
      const neighborPaths = neighborIds.map((id) => `slides/${id}.html`).join("\n");
      const targetBullets = (s.bullets ?? [])
        .map((b, j) => `  ${j + 1}. ${b}`)
        .join("\n");
      const prompt = await renderPrompt("PPT_SLIDE_GENERATOR_PROMPT", {
        slideId: s.id,
        title: s.title,
        bullets: targetBullets,
        notes: s.notes ?? "",
        layout: layout.toString(),
        layoutDirection: LAYOUT_DIRECTIONS[layout - 1] ?? "",
        neighborPaths,
        style: style ? JSON.stringify(style) : "{}",
      });
      return { slideId: s.id, prompt };
    }),
  );
}

async function buildParentUserPrompt(
  outline: Outline,
  style: unknown,
  intent: unknown,
  subPrompts: SubAgentPrompt[],
): Promise<string> {
  const slidesJson = outline.slides.map((s, i) => ({
    id: s.id,
    title: s.title,
    layout: numericLayout(s, i),
  }));
  return renderPrompt("PPT_PARENT_USER_PROMPT", {
    outlineSummary: outline.slides.map((s) => `- ${s.title}`).join("\n"),
    intentJson: intent ?? {},
    styleJson: style ?? {},
    slidesJson,
    subAgentPromptsJson: subPrompts,
  });
}

/**
 * Phase 1 重写：用父 agent + N 个 general-purpose 子 agent 替换 worker pool。
 * 本版本只实现"调 runZaiQuery + 等 runtime 终止事件"。事件桥接
 * （subagent:start / done → onSlideReady 回调）在后续步骤加入。
 */
export async function runOrchestrator(opts: OrchestratorOptions): Promise<OrchestratorResult> {
  const total = opts.outline.slides.length;

  // Step 1: 写 framework HTML，让 renderer 立即能 fetch slides/<id>.html
  const frameworkHtml = `<!DOCTYPE html><html><head><title>${opts.outline.slides[0]?.title ?? "Presentation"}</title></head><body><main id="slides"></main></body></html>`;
  await projectFs.writeProjectFramework(opts.projectId, frameworkHtml);

  // Step 2: 构建父子 prompt
  const subPrompts = await buildSubAgentPrompts(opts.outline, opts.style);
  const parentUserPrompt = await buildParentUserPrompt(
    opts.outline,
    opts.style,
    null,
    subPrompts,
  );

  // Step 3: 调一次 runZaiQuery，启动父 agent
  const parentSystemPrompt = await renderPrompt("PPT_PARENT_SYSTEM_PROMPT", {});
  const stream = runZaiQuery({
    prompt: parentUserPrompt,
    cwd: opts.cwd,
    model: opts.settings.llm.model,
    systemPrompt: parentSystemPrompt,
    maxTurns: 50,
    baseUrl: opts.settings.llm.baseUrl,
    apiKey: opts.settings.llm.apiKey,
    additionalTools: PARENT_AGENT_TOOLS,
  });

  // Step 4: 事件桥 — 父 stream 事件 → onSlideReady 回调 + 内部 slideState
  interface SlideStateEntry {
    status: SlideStatus;
    html?: string;
    error?: string;
    dispatchCount: number;
  }
  const slideState = new Map<string, SlideStateEntry>();
  const subToSlide = new Map<string, string>();
  let cancelled = false;
  let runtimeDone = false;

  const parseSlideId = (desc?: string): string | null => {
    const m = desc?.match(/Generate slide (\S+)/);
    return m ? m[1] : null;
  };

  const getLayoutFor = (slideId: string): 1 | 2 | 3 | 4 | 5 => {
    const idx = opts.outline.slides.findIndex((s) => s.id === slideId);
    return numericLayout(idx >= 0 ? opts.outline.slides[idx] : {}, idx >= 0 ? idx : 0);
  };

  try {
    for await (const ev of stream) {
      const t = (ev as { type: string }).type;
      if (t === "subagent:start") {
        const e = ev as unknown as { subSessionId: string; description?: string };
        const slideId = parseSlideId(e.description);
        if (!slideId) continue;
        subToSlide.set(e.subSessionId, slideId);
        const s = slideState.get(slideId) ?? { status: "pending", dispatchCount: 0 };
        s.dispatchCount++;
        if (s.dispatchCount === 1) {
          s.status = "layout";
          slideState.set(slideId, s);
          await opts.onSlideReady?.({
            id: slideId,
            title: slideId,
            status: "layout",
            layout: getLayoutFor(slideId),
          });
          opts.onProgress?.({ completed: 0, total, slideId, status: "layout" });
        }
      } else if (t === "subagent:done") {
        const e = ev as unknown as { subSessionId: string; exitReason?: string; output?: string };
        const slideId = subToSlide.get(e.subSessionId);
        if (!slideId) continue;
        const layout = getLayoutFor(slideId);
        let html: string | null = null;
        try {
          const fs = await import("node:fs/promises");
          html = await fs.readFile(`${opts.cwd}/slides/${slideId}.html`, "utf8");
        } catch {
          html = null;
        }
        const s = slideState.get(slideId) ?? { status: "pending", dispatchCount: 1 };
        if (e.exitReason === "completed" && html) {
          s.status = "done";
          s.html = html;
          slideState.set(slideId, s);
          await opts.onSlideReady?.({
            id: slideId, title: slideId, status: "done", layout, html,
          });
        } else {
          s.status = "failed";
          s.error = e.output ?? `exitReason=${e.exitReason}`;
          slideState.set(slideId, s);
          await opts.onSlideReady?.({
            id: slideId, title: slideId, status: "failed", layout, error: s.error,
          });
        }
      } else if (t === "runtime.done" || t === "runtime.error") {
        runtimeDone = true;
        break;
      } else if (t === "runtime.aborted") {
        cancelled = true;
        break;
      }
    }
  } catch {
    // runZaiQuery 抛错 → fallback 视为所有 slide 失败
    return { completed: 0, failed: total, total, cancelled: false };
  }

  if (opts.signal?.aborted) cancelled = true;

  // 统计完成 / 失败（runtime 终止但 slide 没动的视为 failed）
  let completed = 0;
  let failed = 0;
  for (const slideId of opts.outline.slides.map((s) => s.id)) {
    const s = slideState.get(slideId);
    if (s?.status === "done") completed++;
    else if (s?.status === "failed") failed++;
    else if (!cancelled && runtimeDone) failed++;
  }

  return { completed, failed, total, cancelled };
}
