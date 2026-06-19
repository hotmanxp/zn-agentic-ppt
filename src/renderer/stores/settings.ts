import { create } from 'zustand'
import { api } from '../lib/api'
import type { Settings } from '@shared/types'

interface SettingsStore {
  settings: Settings | null
  loaded: boolean
  load: () => Promise<void>
  save: (s: Settings) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: null,
  loaded: false,
  load: async () => set({ settings: await api.settings.get(), loaded: true }),
  save: async (s) => { await api.settings.set(s); set({ settings: s }) },
}))
