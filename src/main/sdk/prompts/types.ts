export type PromptVarType = 'string' | 'json'

export interface PromptVar {
  name: string
  description: string
  type: PromptVarType
  /** Optional: shown in settings UI as a hint (e.g. 'target.bullets') */
  example?: string
}

export type PromptId = 'outline' | 'regenerate' | 'slide-system' | 'slide-user' | 'brief-optimize'

export interface PromptSpec {
  id: PromptId
  title: string
  description: string
  defaultTemplate: string
  variables: PromptVar[]
}
