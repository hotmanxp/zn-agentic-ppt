import { create } from 'zustand'
import { api } from '../lib/api'
import type { ProjectMeta } from '@shared/types'

interface ProjectStore {
  projects: ProjectMeta[]
  load: () => Promise<void>
  create: (topic: string) => Promise<ProjectMeta>
  remove: (id: string) => Promise<void>
  rename: (id: string, title: string) => Promise<void>
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  load: async () => set({ projects: await api.project.list() }),
  create: async (topic) => {
    const m = await api.project.create(topic)
    set({ projects: [m, ...get().projects] })
    return m
  },
  remove: async (id) => { await api.project.delete(id); await get().load() },
  rename: async (id, title) => { await api.project.rename(id, title); await get().load() },
}))
