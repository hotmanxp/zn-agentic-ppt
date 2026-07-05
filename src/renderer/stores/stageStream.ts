import { create } from "zustand";
import { api } from "../lib/api.js";
import type { OutlineSlide, StageStreamEvent } from "../lib/api.js";

export type StreamKind = "outline" | "slide-regen";
export type StreamPhase = "idle" | "streaming" | "cancelling" | "done" | "cancelled" | "error";

interface StartResult {
  phase: "done" | "cancelled" | "error";
  slides?: OutlineSlide[];
  html?: string;
  error?: string;
}

interface StageStreamState {
  kind: StreamKind | null;
  projectId: string | null;
  slideId: string | null;
  phase: StreamPhase;
  chars: number;
  html: string;
  error: string | null;
  start: (kind: StreamKind, projectId: string, slideId?: string) => Promise<StartResult>;
  prepare: (kind: StreamKind, projectId: string, slideId?: string) => void;
  cancel: () => Promise<void>;
  applyEvent: (e: StageStreamEvent) => void;
  reset: () => void;
}

export const useStageStreamStore = create<StageStreamState>((set, get) => ({
  kind: null,
  projectId: null,
  slideId: null,
  phase: "idle",
  chars: 0,
  html: "",
  error: null,

  start: async (kind: StreamKind, projectId: string, slideId?: string): Promise<StartResult> => {
    set({
      kind,
      projectId,
      slideId: slideId ?? null,
      phase: "streaming",
      chars: 0,
      html: "",
      error: null,
    });
    try {
      if (kind === "outline") {
        const r = await api.stage.outlineGenerate(projectId);
        if (r.phase === "done") {
          set({ phase: "done", chars: r.slides ? JSON.stringify(r.slides).length : 0 });
          return { phase: "done", slides: r.slides };
        }
        if (r.phase === "cancelled") {
          set({ phase: "cancelled" });
          return { phase: "cancelled" };
        }
        set({ phase: "error", error: "unknown" });
        return { phase: "error", error: "unknown" };
      }
      const r = await api.stage.slideRegenerate(projectId, slideId as string);
      if (r.phase === "done") {
        set({ phase: "done", html: r.html, chars: r.html.length });
        return { phase: "done", html: r.html };
      }
      if (r.phase === "cancelled") {
        set({ phase: "cancelled" });
        return { phase: "cancelled" };
      }
      set({ phase: "error", error: "unknown" });
      return { phase: "error", error: "unknown" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ phase: "error", error: msg });
      return { phase: "error", error: msg };
    }
  },

  /**
   * Set the store's kind/projectId/phase so that in-flight
   * STAGE_OUTLINE_STREAM / STAGE_SLIDE_REGENERATE_STREAM events
   * (already broadcast by the main process for an IPC call that the
   * caller is making themselves) are accepted by applyEvent. This
   * does NOT trigger a fresh IPC call — the caller is responsible for
   * the IPC. Used by approveSources() so the progress bar ticks while
   * the LLM thinks instead of staying at 0% for the full call.
   */
  prepare: (kind: StreamKind, projectId: string, slideId?: string) => {
    set({
      kind,
      projectId,
      slideId: slideId ?? null,
      phase: "streaming",
      chars: 0,
      html: "",
      error: null,
    });
  },

  cancel: async () => {
    const { kind, projectId, slideId } = get();
    if (!kind || !projectId) return;
    set({ phase: "cancelling" });
    try {
      if (kind === "outline") {
        await api.stage.outlineCancel(projectId);
      } else {
        if (slideId) await api.stage.slideCancel(projectId, slideId);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ phase: "error", error: msg });
    }
  },

  applyEvent: (e) => {
    const s = get();
    if (s.kind !== e.kind) return;
    if (s.projectId !== e.projectId) return;
    if (e.kind === "slide-regen" && s.slideId !== e.slideId) return;
    if (e.phase === "streaming") {
      set({ chars: e.chars, html: e.html ?? s.html });
    } else if (e.phase === "done") {
      set({ phase: "done", chars: e.chars, html: e.html ?? s.html });
    } else if (e.phase === "cancelled") {
      set({ phase: "cancelled" });
    } else if (e.phase === "error") {
      set({ phase: "error", error: e.error?.message ?? "unknown" });
    }
  },

  reset: () =>
    set({
      kind: null,
      projectId: null,
      slideId: null,
      phase: "idle",
      chars: 0,
      html: "",
      error: null,
    }),
}));
