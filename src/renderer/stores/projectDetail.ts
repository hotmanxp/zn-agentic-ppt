import type { ProjectDetail } from "@shared/types";
import { create } from "zustand";
import { api } from "../lib/api.js";
import { useOutlineStore } from "./outline.js";
import { usePptGenerationStore } from "./pptGeneration.js";

interface ProjectDetailState {
  detail: ProjectDetail | null;
  loading: boolean;
  error: string | null;
  loadedProjectId: string | null;
  load: (id: string) => Promise<ProjectDetail | null>;
  reload: () => Promise<void>;
  patchDetail: (patch: Partial<ProjectDetail>) => void;
  applySnapshot: (d: ProjectDetail) => void;
  reset: () => void;
}

export const useProjectDetailStore = create<ProjectDetailState>((set, get) => ({
  detail: null,
  loading: false,
  error: null,
  loadedProjectId: null,

  load: async (id) => {
    if (get().loadedProjectId === id && get().detail) return get().detail;
    set({ loading: true, error: null });
    try {
      const detail = await api.project.detail(id);
      if (!detail) {
        set({ loading: false, error: "项目不存在" });
        return null;
      }
      set({ detail, loadedProjectId: id, loading: false, error: null });
      get().applySnapshot(detail);
      return detail;
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? "加载失败" });
      return null;
    }
  },

  reload: async () => {
    const id = get().loadedProjectId;
    if (!id) return;
    set({ loadedProjectId: null });
    await get().load(id);
  },

  patchDetail: (patch) => {
    const cur = get().detail;
    if (!cur) return;
    set({ detail: { ...cur, ...patch } });
  },

  applySnapshot: (d) => {
    if (d.structuredOutline) {
      useOutlineStore.getState().applyDetail({
        slides: d.structuredOutline.slides,
        generatedAt: d.structuredOutline.generatedAt,
      });
    }
    if (d.slides.length > 0) {
      // Build a title map from the structured outline so the artifact
      // panel can show "银企数字化学习平台方案" instead of the slide
      // UUID. ProjectDetail.slides (returned from main) only carries
      // {id, html, layout, status, error} — no title. Without this
      // backfill, opening a project the user already generated shows
      // UUIDs in the per-slide list and the preview header.
      const titleById: Record<string, string> = {};
      if (d.structuredOutline) {
        for (const s of d.structuredOutline.slides) {
          if (s.id && s.title) titleById[s.id] = s.title;
        }
      }
      usePptGenerationStore.getState().applyDetail(
        d.id,
        d.slides.map((s, i) => ({
          id: s.id,
          html: s.html,
          layout: s.layout ?? (((i % 5) + 1) as 1 | 2 | 3 | 4 | 5),
          status: s.status,
          error: s.error,
        })),
        titleById,
      );
    }
  },

  reset: () => set({ detail: null, loading: false, error: null, loadedProjectId: null }),
}));
