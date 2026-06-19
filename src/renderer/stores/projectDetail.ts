import { create } from 'zustand'
import { api } from '../lib/api.js'
import { useOutlineStore } from './outline.js'
import { usePptGenerationStore } from './pptGeneration.js'
import type { ProjectDetail } from '@shared/types'

interface ProjectDetailState {
  detail: ProjectDetail | null
  loading: boolean
  error: string | null
  loadedProjectId: string | null
  load: (id: string) => Promise<void>
  reload: () => Promise<void>
  patchDetail: (patch: Partial<ProjectDetail>) => void
  applySnapshot: (d: ProjectDetail) => void
  reset: () => void
}

export const useProjectDetailStore = create<ProjectDetailState>((set, get) => ({
  detail: null,
  loading: false,
  error: null,
  loadedProjectId: null,

  load: async (id) => {
    if (get().loadedProjectId === id && get().detail) return
    set({ loading: true, error: null })
    try {
      const detail = await api.project.detail(id)
      if (!detail) {
        set({ loading: false, error: '项目不存在' })
        return
      }
      set({ detail, loadedProjectId: id, loading: false, error: null })
      get().applySnapshot(detail)
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? '加载失败' })
    }
  },

  reload: async () => {
    const id = get().loadedProjectId
    if (!id) return
    set({ loadedProjectId: null })
    await get().load(id)
  },

  patchDetail: (patch) => {
    const cur = get().detail
    if (!cur) return
    set({ detail: { ...cur, ...patch } })
  },

  applySnapshot: (d) => {
    if (d.structuredOutline) {
      useOutlineStore.getState().applyDetail({
        slides: d.structuredOutline.slides,
        generatedAt: d.structuredOutline.generatedAt,
      })
    }
    if (d.slides.length > 0) {
      // TODO(stores-track): pptGeneration.applyDetail will be added by Task 11.
      // Call site intentionally passes a single slides[]; the contract is whatever
      // the stores track implements for cross-store restoration.
      ;(usePptGenerationStore.getState() as unknown as { applyDetail: (s: typeof d.slides) => void }).applyDetail(d.slides)
    }
  },

  reset: () => set({ detail: null, loading: false, error: null, loadedProjectId: null }),
}))
