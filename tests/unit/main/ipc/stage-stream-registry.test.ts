import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registry } from '../../../../src/main/ipc/stage-stream-registry.js'

function fakeRunner() {
  return { interrupt: vi.fn() } as any
}

beforeEach(() => {
  registry.reset()
})

describe('stage-stream-registry', () => {
  it('register then cancel by outline key calls interrupt and marks cancelled', () => {
    const r = fakeRunner()
    registry.register('proj-1', r, 'outline')
    registry.markCancelled('proj-1')
    const cancelled = registry.cancel('proj-1')
    expect(cancelled).toBe(true)
    expect(r.interrupt).toHaveBeenCalledOnce()
    expect(registry.isCancelled('proj-1')).toBe(true)
  })

  it('cancel returns false when key not registered', () => {
    expect(registry.cancel('missing')).toBe(false)
  })

  it('unregister removes the runner and isCancelled is false afterwards', () => {
    const r = fakeRunner()
    registry.register('proj-1', r, 'outline')
    registry.markCancelled('proj-1')
    registry.unregister('proj-1')
    expect(registry.isCancelled('proj-1')).toBe(false)
    // second cancel is a no-op
    expect(registry.cancel('proj-1')).toBe(false)
  })

  it('cancel by slide key uses projectId:slideId', () => {
    const r = fakeRunner()
    registry.register('proj-1:slide-A', r, 'slide-regen')
    registry.markCancelled('proj-1:slide-A')
    expect(registry.cancel('proj-1:slide-A')).toBe(true)
    expect(r.interrupt).toHaveBeenCalledOnce()
  })

  it('isCancelled returns false for never-marked keys', () => {
    const r = fakeRunner()
    registry.register('proj-1', r, 'outline')
    expect(registry.isCancelled('proj-1')).toBe(false)
  })

  it('reset clears all state', () => {
    const r1 = fakeRunner()
    const r2 = fakeRunner()
    registry.register('a', r1, 'outline')
    registry.register('b', r2, 'slide-regen')
    registry.markCancelled('a')
    registry.reset()
    expect(registry.cancel('a')).toBe(false)
    expect(registry.cancel('b')).toBe(false)
  })
})
