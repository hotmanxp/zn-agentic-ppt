import type { GenerationRunner } from '../sdk/runner.js'

export type StreamKind = 'outline' | 'slide-regen'

interface ActiveRun {
  runner: GenerationRunner
  kind: StreamKind
}

const activeRuns = new Map<string, ActiveRun>()
const cancelledKeys = new Set<string>()

export const registry = {
  register(key: string, runner: GenerationRunner, kind: StreamKind): void {
    activeRuns.set(key, { runner, kind })
  },

  unregister(key: string): void {
    activeRuns.delete(key)
    cancelledKeys.delete(key)
  },

  markCancelled(key: string): void {
    cancelledKeys.add(key)
  },

  cancel(key: string): boolean {
    const entry = activeRuns.get(key)
    if (!entry) return false
    cancelledKeys.add(key)
    entry.runner.interrupt()
    return true
  },

  isCancelled(key: string): boolean {
    return cancelledKeys.has(key)
  },

  /** Test-only. */
  reset(): void {
    activeRuns.clear()
    cancelledKeys.clear()
  },
}
