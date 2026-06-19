import { create } from 'zustand'
import { api } from '../lib/api.js'
import type { ProjectBrief, AppError } from '@shared/types'

export type Phase = 'idle' | 'optimizing' | 'asking' | 'done' | 'error'

export interface AskUserRequest {
  qid: string
  turn: 1 | 2
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description?: string }>
    multiSelect: boolean
  }>
}

interface State {
  phase: Phase
  current: AskUserRequest | null
  error: string | null
  start: (id: string, hint: ProjectBrief | null) => Promise<void>
  cancel: () => Promise<void>
  answer: (qid: string, value: Record<string, string | string[]>) => void
  applyQuestion: (q: AskUserRequest) => void
  applyDone: (b: ProjectBrief) => void
  applyError: (e: AppError) => void
  reset: () => void
}

export const useBriefOptimizeStore = create<State>((set, get) => ({
  phase: 'idle',
  current: null,
  error: null,
  start: async (id, hint) => {
    set({ phase: 'optimizing', current: null, error: null })
    api.brief.onAskUserQuestion((e: any) => get().applyQuestion(e))
    api.brief.onDone((e: any) => get().applyDone(e.brief))
    api.brief.onError((e: any) => get().applyError(e.error))
    await api.brief.optimize(id, hint)
  },
  cancel: async () => { await api.brief.cancel(); set({ phase: 'idle', current: null }) },
  answer: (qid, value) => {
    void api.brief.answer(qid, { cancelled: false, value })
    set({ phase: 'optimizing', current: null })
  },
  applyQuestion: (q) => set({ phase: 'asking', current: q }),
  applyDone: (b) => set({ phase: 'done', current: null, error: null }),
  applyError: (e) => set({ phase: 'error', current: null, error: e?.message ?? 'unknown' }),
  reset: () => set({ phase: 'idle', current: null, error: null }),
}))