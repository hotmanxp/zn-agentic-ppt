import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../outline.js', () => ({
  useOutlineStore: {
    getState: () => ({ applyDetail: vi.fn() }),
  },
}))

vi.mock('../pptGeneration.js', () => ({
  usePptGenerationStore: {
    getState: () => ({ applyDetail: vi.fn(), reset: vi.fn() }),
  },
}))

vi.mock('../../lib/api.js', () => ({
  api: {
    project: { detail: vi.fn() },
  },
}))

import { useProjectDetailStore } from '../projectDetail.js'
import { api } from '../../lib/api.js'
import { useOutlineStore } from '../outline.js'
import { usePptGenerationStore } from '../pptGeneration.js'

describe('useProjectDetailStore', () => {
  beforeEach(() => {
    useProjectDetailStore.setState({ detail: null, loading: false, error: null, loadedProjectId: null })
    vi.clearAllMocks()
  })

  it('load: sets loading then populates detail', async () => {
    const mockDetail = {
      id: 'p1', title: 't', topic: 'tp', status: 'draft' as const, outline: '',
      pageCount: 0, createdAt: 1, updatedAt: 1, currentStage: 'idle' as const,
      hasSource: false, hasOutline: false, hasHtml: false,
      html: null, htmlSize: null, lastGeneratedAt: null, lastError: null,
      source: 'src', brief: null, structuredOutline: { slides: [], generatedAt: 1 },
      style: { primaryColor: '#000', layout: 'minimal' as const, fontFamily: 'sans' },
      slides: [{ id: 's1', html: '<x/>', status: 'done' as const }],
    }
    vi.mocked(api.project.detail).mockResolvedValue(mockDetail)
    await useProjectDetailStore.getState().load('p1')
    const state = useProjectDetailStore.getState()
    expect(state.detail).toEqual(mockDetail)
    expect(state.loadedProjectId).toBe('p1')
    expect(state.loading).toBe(false)
  })

  it('load: skips if same id already loaded', async () => {
    const existing = { id: 'p1', title: '', topic: '', status: 'draft' as const, outline: '',
      pageCount: 0, createdAt: 0, updatedAt: 0, currentStage: 'idle' as const,
      hasSource: false, hasOutline: false, hasHtml: false,
      html: null, htmlSize: null, lastGeneratedAt: null, lastError: null,
      source: null, brief: null, structuredOutline: null, style: null, slides: [] }
    useProjectDetailStore.setState({ detail: existing, loadedProjectId: 'p1' })
    await useProjectDetailStore.getState().load('p1')
    expect(api.project.detail).not.toHaveBeenCalled()
  })

  it('applySnapshot: dispatches to outline + ppt stores', () => {
    const detail = {
      id: 'p1', title: '', topic: '', status: 'draft' as const, outline: '',
      pageCount: 0, createdAt: 0, updatedAt: 0, currentStage: 'idle' as const,
      hasSource: false, hasOutline: false, hasHtml: false,
      html: null, htmlSize: null, lastGeneratedAt: null, lastError: null,
      source: null, brief: null,
      structuredOutline: { slides: [{ id: 's1', title: 'T', bullets: [] }], generatedAt: 1 },
      style: null,
      slides: [{ id: 's1', html: '<x/>', status: 'done' as const }],
    }
    useProjectDetailStore.getState().applySnapshot(detail)
    expect(useOutlineStore.getState().applyDetail).toHaveBeenCalledWith({
      slides: detail.structuredOutline!.slides,
      generatedAt: 1,
    })
    expect(usePptGenerationStore.getState().applyDetail).toHaveBeenCalledWith(detail.slides)
  })

  it('applySnapshot: does not dispatch outline if structuredOutline is null', () => {
    const detail = {
      id: 'p1', title: '', topic: '', status: 'draft' as const, outline: '',
      pageCount: 0, createdAt: 0, updatedAt: 0, currentStage: 'idle' as const,
      hasSource: false, hasOutline: false, hasHtml: false,
      html: null, htmlSize: null, lastGeneratedAt: null, lastError: null,
      source: null, brief: null, structuredOutline: null, style: null, slides: [],
    }
    useProjectDetailStore.getState().applySnapshot(detail)
    expect(useOutlineStore.getState().applyDetail).not.toHaveBeenCalled()
  })
})
