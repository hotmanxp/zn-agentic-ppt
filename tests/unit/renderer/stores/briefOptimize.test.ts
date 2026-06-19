import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../src/renderer/lib/api.js', () => ({
  api: {
    brief: {
      optimize: vi.fn().mockResolvedValue({ ok: true }),
      cancel: vi.fn().mockResolvedValue({ ok: true }),
      answer: vi.fn(),
      onAskUserQuestion: vi.fn().mockReturnValue(() => {}),
      onDone: vi.fn().mockReturnValue(() => {}),
      onError: vi.fn().mockReturnValue(() => {}),
    },
  },
}))

import { useBriefOptimizeStore } from '../../../../src/renderer/stores/briefOptimize.js'
import { api } from '../../../../src/renderer/lib/api.js'

const mockedApi = vi.mocked(api)

describe('useBriefOptimizeStore', () => {
  beforeEach(() => {
    useBriefOptimizeStore.setState({ phase: 'idle', current: null, error: null })
    vi.clearAllMocks()
    mockedApi.brief.optimize.mockResolvedValue({ ok: true })
    mockedApi.brief.cancel.mockResolvedValue({ ok: true })
    mockedApi.brief.onAskUserQuestion.mockReturnValue(() => {})
    mockedApi.brief.onDone.mockReturnValue(() => {})
    mockedApi.brief.onError.mockReturnValue(() => {})
  })

  it('start calls api.brief.optimize and subscribes to 3 events', async () => {
    await useBriefOptimizeStore.getState().start('p1', null)
    expect(mockedApi.brief.optimize).toHaveBeenCalledWith('p1', null)
    expect(mockedApi.brief.onAskUserQuestion).toHaveBeenCalledTimes(1)
    expect(mockedApi.brief.onDone).toHaveBeenCalledTimes(1)
    expect(mockedApi.brief.onError).toHaveBeenCalledTimes(1)
  })

  it('applyQuestion transitions to asking and sets current', () => {
    useBriefOptimizeStore.getState().applyQuestion({
      qid: 'q1', turn: 1,
      questions: [{ question: 'q', header: 'h', options: [{ label: 'a' }, { label: 'b' }], multiSelect: false }],
    })
    expect(useBriefOptimizeStore.getState().phase).toBe('asking')
    expect(useBriefOptimizeStore.getState().current?.qid).toBe('q1')
  })

  it('answer calls api.brief.answer with qid and value', () => {
    useBriefOptimizeStore.getState().applyQuestion({
      qid: 'q1', turn: 1,
      questions: [{ question: 'q', header: 'h', options: [{ label: 'a' }, { label: 'b' }], multiSelect: false }],
    })
    useBriefOptimizeStore.getState().answer('q1', { q: 'a' })
    expect(mockedApi.brief.answer).toHaveBeenCalledWith('q1', { cancelled: false, value: { q: 'a' } })
    expect(useBriefOptimizeStore.getState().phase).toBe('optimizing')
  })

  it('applyDone transitions to done', () => {
    useBriefOptimizeStore.getState().applyDone({
      name: 'n', audience: 'a', durationMinutes: 30, pageCountEst: 20, content: 'c', style: 's',
    })
    expect(useBriefOptimizeStore.getState().phase).toBe('done')
    expect(useBriefOptimizeStore.getState().error).toBeNull()
  })
})