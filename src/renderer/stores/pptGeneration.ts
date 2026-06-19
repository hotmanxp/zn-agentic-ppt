import { create } from 'zustand'
import { api } from '../lib/api.js'

export type SlideStatus = 'pending' | 'layout' | 'generating' | 'done' | 'failed'

export interface PptSlide {
  id: string
  title: string
  status: SlideStatus
  /** 1-5: visual layout template assigned by the orchestrator (cycles per slide). */
  layout?: 1 | 2 | 3 | 4 | 5
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
    status: 'layout' | 'done' | 'failed'
    html?: string
    error?: string
    durationMs?: number
    retries?: number
    layout?: 1 | 2 | 3 | 4 | 5
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
    slideList.forEach((s, i) => {
      slides[s.id] = { id: s.id, title: s.title, status: 'pending', layout: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5 }
    })
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
    const existing = cur.slides[e.slideId]
    const slide = existing ?? { id: e.slideId, title: e.slideId, status: 'pending' as SlideStatus }
    const next = { ...cur.slides, [e.slideId]: { ...slide, status: e.status, html: e.html, error: e.error, durationMs: e.durationMs, retries: e.retries, layout: e.layout ?? slide.layout } }
    const completed = Object.values(next).filter(s => s.status === 'done').length
    const failed = Object.values(next).filter(s => s.status === 'failed').length
    set({
      projectId: cur.projectId ?? e.projectId,
      total: Math.max(cur.total, e.total),
      slides: next,
      completed,
      failed,
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
