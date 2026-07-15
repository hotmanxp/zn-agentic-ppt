import { create } from "zustand";
import { api } from "../lib/api.js";

export type SlideStatus = "pending" | "layout" | "generating" | "done" | "failed";

export interface PptSlide {
  id: string;
  title: string;
  status: SlideStatus;
  /** 1-5: visual layout template assigned by the orchestrator (cycles per slide). */
  layout?: 1 | 2 | 3 | 4 | 5;
  html?: string;
  error?: string;
  durationMs?: number;
  retries?: number;
}

interface PptGenerationState {
  projectId: string | null;
  /** Per-project slide state, keyed by slide id. */
  slides: Record<string, PptSlide>;
  phase: "idle" | "running" | "done" | "cancelled" | "error";
  /** Last start() error, surfaced to UI so the user can see *why* generation
   * failed (memory: replace-not-augment — prefer the real error over the
   * "未知错误" fallback in the legacy SlidePreview). */
  lastError: string | null;
  completed: number;
  failed: number;
  total: number;
  initialize: (projectId: string, slideList: { id: string; title: string }[]) => void;
  start: (projectId: string) => Promise<void>;
  cancel: () => Promise<void>;
  applySlideReady: (e: {
    projectId: string;
    slideId: string;
    status: "layout" | "done" | "failed";
    html?: string;
    error?: string;
    durationMs?: number;
    retries?: number;
    layout?: 1 | 2 | 3 | 4 | 5;
    completed: number;
    total: number;
  }) => void;
  /**
   * Single-slide regeneration completion. Driven by IPC.HTML_SLIDE_UPDATED
   * (broadcast from main when slideRegenerate finishes). Carries just the
   * new html — completion counts don't change because the slide was already
   * counted as done in the original generate run.
   */
  applySlideUpdated: (e: { projectId: string; slideId: string; html: string }) => void;
  applyGenerateDone: (e: {
    projectId: string;
    completed: number;
    failed: number;
    total: number;
    cancelled: boolean;
  }) => void;
  applyDetail: (
    projectId: string,
    slides: Array<{
      id: string;
      html: string;
      layout?: 1 | 2 | 3 | 4 | 5;
      status: "done" | "failed";
      error?: string;
    }>,
    /**
     * Optional id→title map from the project's structured outline. When
     * loading a project from disk, the per-slide HTML doesn't carry the
     * outline title (only id+html+layout+status+error), so without this
     * the artifact panel would show UUIDs. The map is applied AFTER the
     * default `title: s.id` fallback so titles win.
     */
    titleById?: Record<string, string>,
  ) => void;
  reset: () => void;
}

export const usePptGenerationStore = create<PptGenerationState>((set, get) => ({
  projectId: null,
  slides: {},
  phase: "idle",
  lastError: null,
  completed: 0,
  failed: 0,
  total: 0,

  initialize: (projectId, slideList) => {
    const slides: Record<string, PptSlide> = {};
    slideList.forEach((s, i) => {
      slides[s.id] = {
        id: s.id,
        title: s.title,
        status: "pending",
        layout: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
      };
    });
    set({
      projectId,
      slides,
      phase: "idle",
      completed: 0,
      failed: 0,
      total: slideList.length,
    });
  },

  start: async (projectId) => {
    set({ phase: "running", projectId, lastError: null });
    try {
      const r = await api.stage.htmlGenerate(projectId);
      if (r.phase === "cancelled") set({ phase: "cancelled", lastError: "cancelled" });
      else if (r.phase === "error") set({ phase: "error", lastError: "generation reported error" });
      else set({ phase: "done", completed: r.completed, failed: r.failed, total: r.total });
    } catch (e) {
      // Persist the real error so UI can show it instead of "未知错误"
      // fallback (memory: preserve-raw-llm-text-in-ui-alongside-parsed-fields).
      const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
      console.error("[ppt] htmlGenerate failed:", msg);
      set({ phase: "error", lastError: msg });
    }
  },

  cancel: async () => {
    const { projectId } = get();
    if (!projectId) return;
    await api.stage.htmlCancel(projectId);
  },

  applySlideReady: (e) => {
    const cur = get();
    // Filter by projectId (same as applyGenerateDone). Without this, a
    // late-arriving event from a previous project (e.g. user navigated
    // away mid-generation) could overwrite the current project's slides
    // and trigger the "all-failed preview" symptom (events with status
    // "failed" for the old project arriving after the user re-opened a
    // different one). Events for unknown projects are also dropped so
    // the store doesn't leak state from previous runs.
    if (cur.projectId && cur.projectId !== e.projectId) return;
    const existing = cur.slides[e.slideId];
    const slide = existing ?? { id: e.slideId, title: e.slideId, status: "pending" as SlideStatus };
    const next = {
      ...cur.slides,
      [e.slideId]: {
        ...slide,
        status: e.status,
        html: e.html,
        error: e.error,
        durationMs: e.durationMs,
        retries: e.retries,
        layout: e.layout ?? slide.layout,
      },
    };
    const completed = Object.values(next).filter((s) => s.status === "done").length;
    const failed = Object.values(next).filter((s) => s.status === "failed").length;
    set({
      projectId: cur.projectId ?? e.projectId,
      total: Math.max(cur.total, e.total),
      slides: next,
      completed,
      failed,
    });
  },

  applySlideUpdated: (e) => {
    const cur = get();
    if (cur.projectId && cur.projectId !== e.projectId) return;
    const existing = cur.slides[e.slideId];
    if (!existing) return;
    const next = {
      ...cur.slides,
      [e.slideId]: { ...existing, status: "done" as SlideStatus, html: e.html },
    };
    set({ slides: next });
  },

  applyGenerateDone: (e) => {
    const cur = get();
    if (cur.projectId !== e.projectId) return;
    set({
      phase: e.cancelled ? "cancelled" : e.failed > 0 && e.completed === 0 ? "error" : "done",
      completed: e.completed,
      failed: e.failed,
      total: e.total,
    });
  },

  applyDetail: (projectId, slides, titleById) => {
    const next: Record<string, PptSlide> = {};
    slides.forEach((s, i) => {
      next[s.id] = {
        id: s.id,
        // Prefer the title from the structured outline (provided by
        // the caller) so re-opened projects show "银企数字化学习
        // 平台方案" instead of the slide UUID. Fall back to the id
        // when the title is missing (e.g. very old data).
        title: titleById?.[s.id] ?? s.id,
        status: s.status,
        html: s.html,
        error: s.error,
        layout: s.layout ?? (((i % 5) + 1) as 1 | 2 | 3 | 4 | 5),
      };
    });
    const completed = slides.filter((s) => s.status === "done").length;
    const failed = slides.filter((s) => s.status === "failed").length;
    set({
      projectId,
      slides: next,
      phase: "done",
      completed,
      failed,
      total: slides.length,
    });
  },

  reset: () =>
    set({
      projectId: null,
      slides: {},
      phase: "idle",
      completed: 0,
      failed: 0,
      total: 0,
      lastError: null,
    }),
}));
