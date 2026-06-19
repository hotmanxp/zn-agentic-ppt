export type ProjectStatus = 'draft' | 'generated' | 'failed'

export interface ProjectMeta {
  id: string
  title: string
  topic: string
  status: ProjectStatus
  outline: string
  pageCount: number | null
  createdAt: number
  updatedAt: number
  lastError: string | null
}

export interface ProjectDetail extends ProjectMeta {
  html: string | null
  htmlSize: number | null
  lastGeneratedAt: number | null
  lastError: string | null
}

export type LLMProvider = 'anthropic' | 'openai' | 'custom'

export interface LLMSettings {
  provider: LLMProvider
  baseUrl: string
  apiKey: string
  model: string
}

export interface Settings {
  llm: LLMSettings
  ui: { theme: 'light' | 'dark' }
  paths: { projectsDir: string }
}

export type AppErrorCode =
  | 'AUTH'
  | 'NETWORK'
  | 'RATE_LIMIT'
  | 'PARSE'
  | 'DISK'
  | 'INTERNAL'

export interface AppError {
  code: AppErrorCode
  message: string
  detail?: string
  retryable: boolean
}
