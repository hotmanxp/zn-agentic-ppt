import { create } from 'zustand'
import { api } from '../lib/api'
import type { OutlineSlide, StyleSettings } from '@shared/types'

interface OutlineStore {
  outline: { slides: OutlineSlide[]; generatedAt: number } | null
  style: StyleSettings | null
  loaded: boolean
  applyDetail: (snapshot: { slides: OutlineSlide[]; generatedAt: number }) => void
  setOutline: (slides: OutlineSlide[], generatedAt?: number) => void
  generate: (id: string, topic: string, source: string, brief: any) => Promise<OutlineSlide[]>
  updateSlide: (id: string, slideId: string, patch: Partial<OutlineSlide>) => Promise<void>
  addSlide: (id: string) => Promise<{ slides: OutlineSlide[]; generatedAt: number }>
  deleteSlide: (id: string, slideId: string) => Promise<{ slides: OutlineSlide[]; generatedAt: number }>
  regenerate: (id: string, slideId: string) => Promise<void>
  generateHtml: (id: string) => Promise<void>
  saveStyle: (id: string, style: StyleSettings) => Promise<void>
}

export const useOutlineStore = create<OutlineStore>((set, get) => ({
  outline: null,
  style: null,
  loaded: false,
  applyDetail: (snapshot) => set({
    outline: { slides: snapshot.slides, generatedAt: snapshot.generatedAt },
    loaded: true,
  }),
  setOutline: (slides, generatedAt) => set({
    outline: { slides, generatedAt: generatedAt ?? Date.now() },
    loaded: true,
  }),
  generate: async (id) => {
    const r = await api.stage.outlineGenerate(id)
    if (r.phase === 'done') {
      set({ outline: { slides: r.slides, generatedAt: Date.now() } })
      return r.slides
    }
    return []
  },
  updateSlide: async (id, slideId, patch) => {
    const r = await api.stage.outlineUpdate(id, slideId, patch)
    set({ outline: { slides: r.slides, generatedAt: Date.now() } })
  },
  addSlide: async (id) => {
    const r = await api.stage.slideAdd(id)
    const outline = { slides: r.slides, generatedAt: Date.now() }
    set({ outline })
    return outline
  },
  deleteSlide: async (id, slideId) => {
    const r = await api.stage.slideDelete(id, slideId)
    const outline = { slides: r.slides, generatedAt: Date.now() }
    set({ outline })
    return outline
  },
  regenerate: async (id, slideId) => {
    await api.stage.slideRegenerate(id, slideId)
  },
  generateHtml: async (id) => {
    await api.stage.htmlGenerate(id)
  },
  saveStyle: async (id, style) => {
    await api.stage.styleSave(id, style)
    set({ style })
  },
}))
