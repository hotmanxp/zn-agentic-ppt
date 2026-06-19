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
  currentStage: 'collect' | 'outline' | 'generate' | 'fine-tune' | 'idle'
  hasSource: boolean
  hasOutline: boolean
  hasHtml: boolean
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

// ── PPT wizard types ───────────────────────────────────────────────────────────

export interface OutlineSlide {
  id: string
  title: string
  bullets: string[]
  notes?: string
}

export interface Outline {
  slides: OutlineSlide[]
  generatedAt: number
}

export interface StyleSettings {
  primaryColor: string
  layout: 'minimal' | 'fullbg' | 'columns'
  fontFamily: string
}

export const DEFAULT_STYLE: StyleSettings = {
  primaryColor: '#1677ff',
  layout: 'minimal',
  fontFamily: '-apple-system, sans-serif',
}
