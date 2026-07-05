import type { OutlineSlide } from "../../shared/types.js";
import * as projectFs from "../fs/projects.js";
import { generateFrameworkHtml, generateLayoutHtml } from "./ppt-framework.js";

export interface LayoutProgress {
  layoutsWritten: number;
  total: number;
}

/**
 * Instant layout-only generation: writes a placeholder skeleton
 * section for every slide based on its outline (no LLM call).
 * Used right after the outline is ready so the user sees the
 * N-slide structure immediately, before any LLM content fill.
 */
export async function generateLayoutsOnly(
  projectId: string,
  slides: OutlineSlide[],
  onProgress?: (p: LayoutProgress) => void,
): Promise<{ written: number; total: number }> {
  const topic = slides[0]?.title ?? "Presentation";
  const framework = generateFrameworkHtml({
    topic,
    slides: slides.map((s) => ({ id: s.id, title: s.title })),
  });
  await projectFs.writeProjectFramework(projectId, framework);
  for (let i = 0; i < slides.length; i++) {
    const html = generateLayoutHtml(slides[i]);
    await projectFs.writeProjectSlide(projectId, slides[i].id, html);
    onProgress?.({ layoutsWritten: i + 1, total: slides.length });
  }
  return { written: slides.length, total: slides.length };
}
