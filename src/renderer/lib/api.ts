import type { ProjectMeta, ProjectDetail, Settings } from '@shared/types'

export interface BridgeApi {
  project: {
    list(): Promise<ProjectMeta[]>
    get(id: string): Promise<ProjectDetail | null>
    create(topic: string): Promise<ProjectMeta>
    update(id: string, patch: Partial<Pick<ProjectMeta, 'title' | 'topic' | 'outline'>>): Promise<ProjectMeta>
    delete(id: string): Promise<void>
    duplicate(id: string): Promise<ProjectMeta>
    rename(id: string, title: string): Promise<void>
    reveal(id: string): Promise<void>
  }
  generation: {
    start(id: string, opts?: object): Promise<{ runId: string }>
    cancel(runId: string): Promise<void>
    onEvent(cb: (e: any) => void): () => void
    onProgress(cb: (e: any) => void): () => void
    onDone(cb: (e: any) => void): () => void
    onError(cb: (e: any) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    set(settings: Settings): Promise<void>
    testConnection(): Promise<{ ok: boolean; models?: string[]; error?: string }>
  }
  system: {
    userDataPath(): Promise<string>
  }
}

declare global {
  interface Window { api: BridgeApi }
}

export const api: BridgeApi = window.api
