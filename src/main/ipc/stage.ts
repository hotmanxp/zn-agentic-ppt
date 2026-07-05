import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels.js";
import type { OutlineSlide, ProjectBrief, StyleSettings } from "../../shared/types.js";
import * as outlineFs from "../fs/outline.js";
import { getProjectDir } from "../fs/paths.js";
import * as projectFs from "../fs/projects.js";
import * as settingsFs from "../fs/settings.js";
import { spliceSlide } from "../sdk/html-splice.js";
import { renderPrompt } from "../sdk/prompts/index.js";
import { GenerationRunner } from "../sdk/runner.js";

function broadcast(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload);
  }
}

import { extractFirstJsonValue } from "../sdk/json-extract.js";
import { generateLayoutsOnly } from "../sdk/ppt-layout.js";
import { runOrchestrator } from "../sdk/ppt-orchestrator.js";
import { registry } from "./stage-stream-registry.js";

const pptHtmlCancels = new Map<string, AbortController>();

async function loadSettingsAndOutline(id: string) {
  const settings = await settingsFs.getSettings();
  const project = await projectFs.getProject(id);
  if (!project) throw new Error("project not found");
  const outline = await outlineFs.readOutline(id);
  if (!outline) throw new Error("outline not found");
  // Defense in depth: any outline.json without slide ids (legacy data,
  // LLM output before the write-side backfill was added, or hand-edited
  // files) would crash downstream consumers like the slide orchestrator
  // (writeProjectSlide(undefined, html) → "Cannot read properties of
  // undefined (reading 'replace')"). Backfill in memory + persist so the
  // next read is consistent.
  if (outlineFs.backfillSlideIds(outline.slides)) {
    console.warn(`[loadSettingsAndOutline:${id}] backfilled missing slide id(s) on read`);
    await outlineFs.writeOutline(id, outline);
  }
  return { settings, project, outline };
}

export function registerStageIPC() {
  ipcMain.handle(
    IPC.STAGE_COLLECT_SAVE,
    async (
      _,
      {
        id,
        topic,
        source,
        brief,
      }: { id: string; topic: string; source: string; brief: ProjectBrief | null },
    ) => {
      await outlineFs.writeSource(id, source);
      if (brief) {
        await projectFs.writeProjectBrief(id, brief);
      }
      const existing = await projectFs.getProject(id);
      if (existing) {
        await projectFs.updateProject(id, { topic });
      }
    },
  );

  ipcMain.handle(IPC.STAGE_OUTLINE_GENERATE, async (_, { id }: { id: string }) => {
    const project = await projectFs.getProject(id);
    if (!project) throw new Error("project not found");
    const brief = project.brief;
    if (!brief?.markdown) {
      throw new Error("project has no brief — user must complete Stage 1 优化 first");
    }
    const source = await outlineFs.readSource(id);
    const settings = await settingsFs.getSettings();
    const cwd = getProjectDir(id);
    const key = id;
    let buffer = "";
    const runner = new GenerationRunner({
      cwd,
      topic: project.topic,
      outline: brief.markdown ?? source,
      settings,
      runId: id,
      systemPrompt: await renderPrompt("OUTLINE_PROMPT", {
        briefMarkdown: brief.markdown,
      }),
      userMessage: "请根据以上指令生成大纲。",
      onEvent: () => {},
      onProgress: (info) =>
        broadcast(IPC.STAGE_OUTLINE_STREAM, {
          runId: key,
          projectId: id,
          kind: "outline",
          phase: "streaming",
          chars: info.current,
        }),
      onDone: ({ html, durationMs }) => {
        buffer = html;
        broadcast(IPC.STAGE_OUTLINE_STREAM, {
          runId: key,
          projectId: id,
          kind: "outline",
          phase: "done",
          chars: html.length,
          html,
          durationMs,
        });
        registry.unregister(key);
      },
      onError: ({ error }) => {
        const phase = registry.isCancelled(key) ? "cancelled" : "error";
        broadcast(IPC.STAGE_OUTLINE_STREAM, {
          runId: key,
          projectId: id,
          kind: "outline",
          phase,
          error,
        });
        registry.unregister(key);
        if (phase === "error") throw new Error(error.message);
      },
    });
    registry.register(key, runner, "outline");
    await runner.run();
    if (registry.isCancelled(key)) {
      return { phase: "cancelled" as const };
    }
    let parsed: { slides: OutlineSlide[] };
    try {
      parsed = extractFirstJsonValue<{ slides: OutlineSlide[] }>(buffer);
    } catch (e: any) {
      console.log(`[outline:${id}] JSON extraction failed: ${e?.message ?? e}`);
      console.log(`[outline:${id}] LLM buffer (first 800 chars): ${buffer.slice(0, 800)}`);
      console.log(`[outline:${id}] LLM buffer length: ${buffer.length}`);
      throw e;
    }
    console.log(
      `[outline:${id}] parsed ${JSON.stringify(parsed).length} chars, slides=${parsed.slides?.length ?? "?"}`,
    );
    if (!Array.isArray(parsed.slides) || parsed.slides.length === 0) {
      console.log(`[outline:${id}] LLM buffer (first 500 chars): ${buffer.slice(0, 500)}`);
      throw new Error("LLM 返回的 JSON 不包含 slides 数组或 slides 为空");
    }
    // Backfill slide ids before persisting. LLM output often omits the `id`
    // field; without it, every downstream consumer (orchestrator, slide
    // regen, IPC patches) breaks because they key by `slide.id`.
    if (outlineFs.backfillSlideIds(parsed.slides)) {
      console.log(`[outline:${id}] backfilled missing slide id(s)`);
    }
    await outlineFs.writeOutline(id, { slides: parsed.slides, generatedAt: Date.now() });
    return { phase: "done" as const, slides: parsed.slides };
  });

  ipcMain.handle(
    IPC.STAGE_OUTLINE_UPDATE,
    async (_, { id, slideId, patch }: { id: string; slideId: string; patch: any }) => {
      return await outlineFs.updateSlide(id, slideId, patch);
    },
  );

  ipcMain.handle(IPC.STAGE_OUTLINE_READ, async (_, { id }: { id: string }) => {
    const outline = await outlineFs.readOutline(id);
    if (!outline) return null;
    // Backfill missing slide ids (legacy data + LLM output without id field)
    let mutated = false;
    for (const s of outline.slides) {
      if (!s.id) {
        (s as any).id = randomUUID();
        mutated = true;
      }
    }
    if (mutated) await outlineFs.writeOutline(id, outline);
    return outline;
  });

  ipcMain.handle(IPC.STAGE_SLIDE_ADD, async (_, { id }: { id: string }) => {
    return await outlineFs.addSlide(id);
  });

  ipcMain.handle(
    IPC.STAGE_SLIDE_DELETE,
    async (_, { id, slideId }: { id: string; slideId: string }) => {
      return await outlineFs.deleteSlide(id, slideId);
    },
  );

  ipcMain.handle(
    IPC.STAGE_SLIDE_REGENERATE,
    async (_, { id, slideId }: { id: string; slideId: string }) => {
      const { settings, outline } = await loadSettingsAndOutline(id);
      const target = outline.slides.find((s) => s.id === slideId);
      if (!target) throw new Error("slide not found");
      const htmlPath = join(getProjectDir(id), "index.html");
      let currentHtml = "";
      try {
        currentHtml = await readFile(htmlPath, "utf8");
      } catch {}
      const cwd = getProjectDir(id);
      const others = outline.slides
        .filter((s) => s.id !== slideId)
        .map((s) => ({ id: s.id, title: s.title }));
      const currentSection = extractSection(currentHtml, slideId) ?? "";
      const layoutIdx = target.layout
        ? (() => {
            if (target.layout === "cover") return 1;
            if (target.layout === "list") return 2;
            if (target.layout === "columns") return 3;
            if (target.layout === "stats") return 4;
            return 5;
          })()
        : undefined;
      const layoutHint = layoutIdx
        ? `【本张幻灯片指定 layout = layout-${layoutIdx}】—— **必须**使用对应的模板，与整套 PPT 的轮换 layout 一致。`
        : "";
      const prompt = await renderPrompt("REGENERATE_PROMPT", {
        target,
        others,
        currentSectionHtml: currentSection,
        layout: layoutIdx?.toString() ?? "",
        slideId,
        layoutHint,
      });
      const key = `${id}:${slideId}`;
      const runner = new GenerationRunner({
        cwd,
        topic: target.title,
        outline: prompt,
        settings,
        runId: id,
        systemPrompt: prompt,
        userMessage: "请根据以上指令重新生成该页。",
        onEvent: () => {},
        onProgress: (info) =>
          broadcast(IPC.STAGE_SLIDE_REGENERATE_STREAM, {
            runId: key,
            projectId: id,
            slideId,
            kind: "slide-regen",
            phase: "streaming",
            chars: info.current,
          }),
        onDone: ({ html, durationMs }) => {
          const newSection = extractSection(html, slideId) ?? html.trim();
          const spliced = spliceSlide(currentHtml, slideId, newSection);
          projectFs.writeProjectHtml(id, spliced).then(() => {
            broadcast(IPC.HTML_SLIDE_UPDATED, { projectId: id, slideId, html: newSection });
          });
          broadcast(IPC.STAGE_SLIDE_REGENERATE_STREAM, {
            runId: key,
            projectId: id,
            slideId,
            kind: "slide-regen",
            phase: "done",
            chars: html.length,
            html: newSection,
            durationMs,
          });
          registry.unregister(key);
        },
        onError: ({ error }) => {
          const phase = registry.isCancelled(key) ? "cancelled" : "error";
          broadcast(IPC.STAGE_SLIDE_REGENERATE_STREAM, {
            runId: key,
            projectId: id,
            slideId,
            kind: "slide-regen",
            phase,
            error,
          });
          registry.unregister(key);
          if (phase === "error") throw new Error(error.message);
        },
      });
      registry.register(key, runner, "slide-regen");
      try {
        await runner.run();
      } catch (e: any) {
        // The vendored SDK throws "Cannot read properties of undefined
        // (reading 'safeParse')" when its internal agent validator
        // references a tool the SDK didn't load (e.g. NotebookRead).
        // The regeneration may have actually written a partial file
        // before the throw, so we surface the error but don't lose
        // the rest of the flow.
        const msg = e?.message ?? String(e);
        console.error(`[stage:slide-regenerate:${key}] THROW:`, msg, e?.stack);
        registry.unregister(key);
        return { phase: "error" as const, error: msg };
      }
      if (registry.isCancelled(key)) {
        return { phase: "cancelled" as const };
      }
      return { phase: "done" as const, html: "", durationMs: 0 };
    },
  );

  ipcMain.handle(IPC.STAGE_HTML_GENERATE, async (_, { id }: { id: string }) => {
    const { settings, outline } = await loadSettingsAndOutline(id);
    const style = await outlineFs.readStyle(id);
    const cwd = getProjectDir(id);
    const ac = new AbortController();
    pptHtmlCancels.set(id, ac);
    await projectFs.clearProjectSlides(id);
    try {
      const result = await runOrchestrator({
        projectId: id,
        outline,
        settings,
        style,
        cwd,
        concurrency: 3,
        maxRetries: 2,
        signal: ac.signal,
        onSlideReady: async (slide) => {
          broadcast(IPC.STAGE_HTML_SLIDE_READY, {
            projectId: id,
            slideId: slide.id,
            status: slide.status,
            html: slide.html,
            error: slide.error,
            durationMs: slide.durationMs,
            retries: slide.retries,
            layout: slide.layout,
            completed: 0, // filled by orchestrator state — recompute on renderer
            total: outline.slides.length,
          });
        },
        onProgress: ({ completed, total }) => {
          broadcast(IPC.GENERATION_PROGRESS, {
            runId: id,
            phase: "streaming",
            current: completed,
            total,
          });
        },
      });
      await projectFs.setProjectStatus(id, result.failed > 0 ? "failed" : "generated");
      broadcast(IPC.STAGE_HTML_GENERATE_DONE, {
        projectId: id,
        completed: result.completed,
        failed: result.failed,
        total: result.total,
        cancelled: result.cancelled,
      });
      pptHtmlCancels.delete(id);
      if (result.cancelled)
        return {
          phase: "cancelled" as const,
          completed: result.completed,
          failed: result.failed,
          total: result.total,
        };
      return {
        phase: "done" as const,
        completed: result.completed,
        failed: result.failed,
        total: result.total,
      };
    } catch (e: any) {
      pptHtmlCancels.delete(id);
      // Verbose log so the failure cause is recoverable from main logs.
      console.error(`[stage:html-generate:${id}] FAILED:`, e?.message);
      console.error(`[stage:html-generate:${id}] STACK:`, e?.stack);
      await projectFs.setProjectStatus(id, "failed", e?.message ?? String(e));
      broadcast(IPC.STAGE_HTML_GENERATE_DONE, {
        projectId: id,
        completed: 0,
        failed: outline.slides.length,
        total: outline.slides.length,
        cancelled: false,
      });
      return {
        phase: "error" as const,
        completed: 0,
        failed: outline.slides.length,
        total: outline.slides.length,
        error: e?.message ?? String(e),
      };
    }
  });

  ipcMain.handle(IPC.STAGE_HTML_CANCEL, async (_, { id }: { id: string }) => {
    const ac = pptHtmlCancels.get(id);
    if (ac) {
      ac.abort();
      pptHtmlCancels.delete(id);
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.handle(IPC.STAGE_LAYOUT_GENERATE, async (_, { id }: { id: string }) => {
    const { outline } = await loadSettingsAndOutline(id);
    if (!outline.slides.length) throw new Error("No outline slides to layout");
    return await generateLayoutsOnly(id, outline.slides);
  });

  ipcMain.handle(
    IPC.STAGE_STYLE_SAVE,
    async (_, { id, style }: { id: string; style: StyleSettings }) => {
      await outlineFs.writeStyle(id, style);
    },
  );

  ipcMain.handle(IPC.STAGE_OUTLINE_CANCEL, async (_, { id }: { id: string }) => {
    registry.markCancelled(id);
    const ok = registry.cancel(id);
    return { ok };
  });

  ipcMain.handle(
    IPC.STAGE_SLIDE_CANCEL,
    async (_, { id, slideId }: { id: string; slideId: string }) => {
      const key = `${id}:${slideId}`;
      registry.markCancelled(key);
      const ok = registry.cancel(key);
      return { ok };
    },
  );
}

function extractSection(html: string, slideId: string): string | null {
  const m = html.match(
    new RegExp(`<section[^>]*data-id=["']${slideId}["'][^>]*>[\\s\\S]*?</section>`, "i"),
  );
  return m ? m[0] : null;
}
