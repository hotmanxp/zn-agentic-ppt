import { create } from 'zustand'
import { api } from '../lib/api.js'

export type SlideStatus = 'pending' | 'generating' | 'done' | 'failed'

export interface PptSlide {
  id: string
  title: string
  status: SlideStatus
  html?: string
  error?: string
  durationMs?: number
  retries?: number
}

interface PptGenerationState {
  projectId: string | null
  /** Per-project slide state, keyed by slide id. */
  slides: Record<string, PptSlide>
  phase: 'idle' | 'running' | 'done' | 'cancelled' | 'error'
  completed: number
  failed: number
  total: number
  initialize: (projectId: string, slideList: { id: string; title: string }[]) => void
  start: (projectId: string) => Promise<void>
  cancel: () => Promise<void>
  applySlideReady: (e: {
    projectId: string
    slideId: string
    status: 'done' | 'failed'
    html?: string
    error?: string
    durationMs?: number
    retries?: number
    completed: number
    total: number
  }) => void
  applyGenerateDone: (e: {
    projectId: string
    completed: number
    failed: number
    total: number
    cancelled: boolean
  }) => void
  reset: () => void
}

export const usePptGenerationStore = create<PptGenerationState>((set, get) => ({
  projectId: null,
  slides: {},
  phase: 'idle',
  completed: 0,
  failed: 0,
  total: 0,

  initialize: (projectId, slideList) => {
    const slides: Record<string, PptSlide> = {}
    for (const s of slideList) slides[s.id] = { id: s.id, title: s.title, status: 'pending' }
    set({
      projectId, slides, phase: 'idle', completed: 0, failed: 0, total: slideList.length,
    })
  },

  start: async (projectId) => {
    set({ phase: 'running', projectId })
    try {
      const r = await api.stage.htmlGenerate(projectId)
      if (r.phase === 'cancelled') set({ phase: 'cancelled' })
      else if (r.phase === 'error') set({ phase: 'error' })
      else set({ phase: 'done', completed: r.completed, failed: r.failed, total: r.total })
    } catch (e: any) {
      set({ phase: 'error' })
    }
  },

  cancel: async () => {
    const { projectId } = get()
    if (!projectId) return
    await api.stage.htmlCancel(projectId)
  },

  applySlideReady: (e) => {
    const cur = get()
    if (cur.projectId !== e.projectId) return
    const slide = cur.slides[e.slideId]
    if (!slide) return
    set({
      slides: {
        ...cur.slides,
        [e.slideId]: {
          ...slide,
          status: e.status,
          html: e.html,
          error: e.error,
          durationMs: e.durationMs,
          retries: e.retries,
        },
      },
      completed: e.completed,
      total: e.total,
    })
  },

  applyGenerateDone: (e) => {
    const cur = get()
    if (cur.projectId !== e.projectId) return
    set({
      phase: e.cancelled ? 'cancelled' : (e.failed > 0 && e.completed === 0 ? 'error' : 'done'),
      completed: e.completed,
      failed: e.failed,
      total: e.total,
    })
  },

  reset: () => set({ projectId: null, slides: {}, phase: 'idle', completed: 0, failed: 0, total: 0 }),
}))
