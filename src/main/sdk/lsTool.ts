// LS tool — alias for "list directory contents" registered as a vendor SDK
// system tool. Resolves the "agent references unknown tool 'LS'" warning
// emitted by vendor SDK's injectAgents validator when plugins declare
// `LS` in their agent's `tools:` list (e.g. feature-dev's code-explorer).
//
// We don't actually invoke feature-dev sub-agents, but the validator runs on
// every query() start, so registering LS here silences the warning. The tool
// is real: it can list a directory the LLM names, matching Read/Write's
// "feel" for the LLM when it does try to use it.
import { readdirSync, statSync } from 'node:fs'
// @ts-ignore vendor bundle — no types available
import { registerExternalTool } from '../../../vendor/sdk.mjs'

let registered = false

/**
 * Register the LS system tool with the vendor SDK exactly once.
 * Idempotent across HMR/reload — subsequent calls are no-ops.
 */
export function ensureLsToolRegistered(): void {
  if (registered) return
  registered = true
  registerExternalTool({
    name: 'LS',
    description: 'List the entries of a directory. Returns one line per entry with a `d` (directory) or `-` (file) prefix.',
    inputJSONSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path of the directory to list.',
        },
      },
      required: ['path'],
    },
    isEnabled: () => true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    isDestructive: () => false,
    checkPermissions: (input: unknown) =>
      Promise.resolve({ behavior: 'allow' as const, updatedInput: input }),
    async call({ path }: { path: string }) {
      try {
        const stat = statSync(path)
        if (!stat.isDirectory()) {
          return [{ type: 'text' as const, text: `not a directory: ${path}` }]
        }
        const entries = readdirSync(path, { withFileTypes: true })
        const text = entries
          .map((e) => `${e.isDirectory() ? 'd' : '-'} ${e.name}`)
          .sort()
          .join('\n')
        return [{ type: 'text' as const, text: text || '(empty directory)' }]
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return [{ type: 'text' as const, text: `LS error: ${msg}` }]
      }
    },
  })
}