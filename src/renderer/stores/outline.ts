import { create } from 'zustand'
import { api } from '../lib/api'
import type { OutlineSlide, StyleSettings } from '@shared/types'

interface OutlineStore {
  outline: { slides: OutlineSlide[]; generatedAt: number } | null
  style: StyleSettings | null
  loaded: boolean
  load: (id: string) => Promise<void>
  generate: (id: string, topic: string, source: string) => Promise<OutlineSlide[]>
  updateSlide: (id: string, slideId: string, patch: Partial<OutlineSlide>) => Promise<void>
  addSlide: (id: string) => Promise<{ slides: OutlineSlide[]; generatedAt: number }>
  deleteSlide: (id: string, slideId: string) => Promise<{ slides: OutlineSlide[]; generatedAt: number }>
  regenerate: (id: string, slideId: string) => Promise<void>
  generateHtml: (id: string) => Promise<string>
  saveStyle: (id: string, style: StyleSettings) => Promise<void>
}

export const useOutlineStore = create<OutlineStore>((set, get) => ({
  outline: null,
  style: null,
  loaded: false,
  load: async (id) => {
    await api.project.get(id)
    set({ loaded: true })
  },
  generate: async (id, topic, source) => {
    await api.stage.collectSave(id, topic, source)
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
    const r = await api.stage.htmlGenerate(id)
    return r.html
  },
  saveStyle: async (id, style) => {
    await api.stage.styleSave(id, style)
    set({ style })
  },
}))
