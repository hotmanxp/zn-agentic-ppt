import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IPC } from '../../../../src/shared/ipc-channels.js'

const handlers = new Map<string, Function>()
vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: Function) => handlers.set(ch, fn) },
  BrowserWindow: { getAllWindows: () => [] },
}))

const mockAgent = {
  run: vi.fn(),
  cancel: vi.fn(),
  answer: vi.fn(),
}

vi.mock('../../../../src/main/sdk/agents/briefAgent.js', () => ({
  BriefAgent: vi.fn().mockImplementation(() => mockAgent),
}))

vi.mock('../../../../src/main/fs/projects.js', () => ({
  readProjectBrief: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../../../src/main/fs/outline.js', () => ({
  readSource: vi.fn().mockResolvedValue('raw source content'),
}))

vi.mock('../../../../src/main/fs/settings.js', () => ({
  getSettings: vi.fn().mockResolvedValue({ llm: { provider: 'anthropic', baseUrl: '', apiKey: '', model: 'm' }, ui: { theme: 'light' }, paths: { projectsDir: '' } }),
}))

import { registerBriefIPC } from '../../../../src/main/ipc/brief.js'

describe('brief IPC', () => {
  beforeEach(() => {
    handlers.clear()
    mockAgent.run.mockReset()
    mockAgent.cancel.mockReset()
    mockAgent.answer.mockReset()
  })

  it('start handler constructs BriefAgent and calls run', async () => {
    registerBriefIPC()
    const start = handlers.get(IPC.STAGE_BRIEF_OPTIMIZE_START)!
    await start({}, { id: 'p1', hint: null })
    expect(mockAgent.run).toHaveBeenCalledTimes(1)
  })

  it('cancel handler calls agent.cancel', async () => {
    registerBriefIPC()
    const cancel = handlers.get(IPC.STAGE_BRIEF_OPTIMIZE_CANCEL)!
    cancel({}, {})
    expect(mockAgent.cancel).toHaveBeenCalledTimes(1)
  })

  it('answer handler calls agent.answer with qid+value', async () => {
    registerBriefIPC()
    // Start first so activeAgent is populated
    const start = handlers.get(IPC.STAGE_BRIEF_OPTIMIZE_START)!
    await start({}, { id: 'p1', hint: null })
    const answer = handlers.get(IPC.STAGE_BRIEF_OPTIMIZE_ANSWER)!
    answer({}, { qid: 'q1', value: { cancelled: false, value: { 'q1': 'a' } } })
    expect(mockAgent.answer).toHaveBeenCalledWith('q1', { cancelled: false, value: { 'q1': 'a' } })
  })
})
