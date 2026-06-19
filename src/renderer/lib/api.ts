import type { ProjectMeta, ProjectDetail, Settings, OutlineSlide, StyleSettings } from '@shared/types'

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
  stage: {
    collectSave(id: string, topic: string, source: string): Promise<void>
    outlineGenerate(id: string): Promise<{ slides: OutlineSlide[] }>
    outlineUpdate(id: string, slideId: string, patch: Partial<OutlineSlide>): Promise<{ slides: OutlineSlide[] }>
    slideAdd(id: string): Promise<{ slides: OutlineSlide[] }>
    slideDelete(id: string, slideId: string): Promise<{ slides: OutlineSlide[] }>
    slideRegenerate(id: string, slideId: string): Promise<{ html: string; durationMs: number }>
    htmlGenerate(id: string): Promise<{ html: string; durationMs: number }>
    styleSave(id: string, style: StyleSettings): Promise<void>
    onSlideUpdated(cb: (e: { projectId: string; slideId: string; html: string }) => void): () => void
    onOutlineStream(cb: (e: any) => void): () => void
  }
}

declare global {
  interface Window { api: BridgeApi }
}

export const api: BridgeApi = window.api
