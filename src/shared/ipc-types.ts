import type { ProjectDetail, ProjectMeta, Settings } from './types.js'

export interface SDKEventPayload {
  runId: string
  message: unknown // narrow in renderer
}

export interface GenerationProgressPayload {
  runId: string
  phase: 'connecting' | 'streaming' | 'writing'
  current: number
  total?: number
}

export interface GenerationDonePayload {
  runId: string
  html: string
  durationMs: number
}

export interface GenerationErrorPayload {
  runId: string
  error: { code: string; message: string; retryable: boolean }
}

export interface StartGenerationRequest {
  id: string
  opts?: { model?: string }
}

export interface StartGenerationResponse {
  runId: string
}

export interface CreateProjectRequest {
  topic: string
}

export interface UpdateProjectRequest {
  id: string
  patch: Partial<Pick<ProjectMeta, 'title' | 'topic' | 'outline'>>
}

export type {
  ProjectMeta,
  ProjectDetail,
  Settings,
}
