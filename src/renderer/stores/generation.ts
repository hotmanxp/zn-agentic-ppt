import { create } from 'zustand'
import { api } from '../lib/api'

interface GenerationStore {
  runId: string | null
  phase: 'idle' | 'streaming' | 'done' | 'error'
  progress: number
  html: string | null
  error: string | null
  start: (id: string) => Promise<void>
  cancel: () => Promise<void>
  reset: () => void
}

export const useGenerationStore = create<GenerationStore>((set, get) => ({
  runId: null,
  phase: 'idle',
  progress: 0,
  html: null,
  error: null,
  start: async (id) => {
    set({ phase: 'streaming', progress: 0, html: null, error: null })
    const { runId } = await api.generation.start(id)
    set({ runId })
  },
  cancel: async () => {
    const { runId } = get()
    if (runId) await api.generation.cancel(runId)
    set({ phase: 'idle', runId: null })
  },
  reset: () => set({ runId: null, phase: 'idle', progress: 0, html: null, error: null }),
}))
