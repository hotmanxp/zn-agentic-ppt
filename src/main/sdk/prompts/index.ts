import type { PromptSpec, PromptVar } from './types.js'

/**
 * Replaces {{var}} placeholders. Variables must be declared in `spec`;
 * runtime values come from `vars`. JSON variables are stringified with
 * 2-space indent. Unknown / missing variables throw — the caller is
 * expected to provide everything declared in the spec.
 */
export function fillTemplate(
  template: string,
  vars: Record<string, unknown>,
  spec: PromptVar[],
): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g, (match, name: string) => {
    const v = spec.find(s => s.name === name)
    if (!v) throw new Error(`模板引用了未声明变量: ${match}`)
    if (!(name in vars)) throw new Error(`渲染变量 ${name} 缺值（prompt id 应在调用方传入）`)
    const val = vars[name]
    if (v.type === 'json') return JSON.stringify(val, null, 2)
    return String(val)
  })
}

/**
 * Registry of all known prompts. Populated by individual spec modules.
 * Filled below via `registerPrompt()` to avoid circular imports.
 */
export const PROMPT_SPECS: PromptSpec[] = []

export function registerPrompt(spec: PromptSpec): void {
  if (PROMPT_SPECS.some(s => s.id === spec.id)) {
    throw new Error(`prompt id 重复: ${spec.id}`)
  }
  PROMPT_SPECS.push(spec)
}

export function getSpec(id: string): PromptSpec | null {
  return PROMPT_SPECS.find(s => s.id === id) ?? null
}
