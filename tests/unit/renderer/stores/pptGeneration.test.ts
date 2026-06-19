import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  const g = globalThis as any
  g.window = g.window ?? {}
  g.window.api = {
    stage: {
      htmlGenerate: vi.fn(),
      htmlCancel: vi.fn(),
    },
  }
})

import { usePptGenerationStore } from '../../../../src/renderer/stores/pptGeneration.js'

describe('usePptGenerationStore.applyDetail', () => {
  beforeEach(() => {
    usePptGenerationStore.setState({
      projectId: null, slides: {}, phase: 'idle', completed: 0, failed: 0, total: 0,
    })
  })

  it('populates slides from detail payload', () => {
    usePptGenerationStore.getState().applyDetail('p1', [
      { id: 's1', html: '<x/>', status: 'done', layout: 2 },
      { id: 's2', html: '<y/>', status: 'failed', error: 'boom' },
    ])
    const state = usePptGenerationStore.getState()
    expect(state.projectId).toBe('p1')
    expect(state.slides.s1.status).toBe('done')
    expect(state.slides.s1.layout).toBe(2)
    expect(state.slides.s2.status).toBe('failed')
    expect(state.slides.s2.error).toBe('boom')
    expect(state.total).toBe(2)
    expect(state.phase).toBe('done')
  })

  it('reset clears all state', () => {
    usePptGenerationStore.getState().applyDetail('p1', [{ id: 's1', html: '<x/>', status: 'done' }])
    usePptGenerationStore.getState().reset()
    const state = usePptGenerationStore.getState()
    expect(state.projectId).toBeNull()
    expect(state.slides).toEqual({})
    expect(state.phase).toBe('idle')
  })
})
