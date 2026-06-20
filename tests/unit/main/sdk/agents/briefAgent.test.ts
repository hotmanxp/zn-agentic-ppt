import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()
const mockInterrupt = vi.fn()
const mockRegisterExternalTool = vi.fn(() => () => {}) // returns unregister fn

vi.mock('../../../../../vendor/sdk.mjs', () => ({
  query: (params: any) => {
    mockQuery(params)
    return {
      sessionId: 'sess-1',
      [Symbol.asyncIterator]: () => {
        const events = params.__events ?? []
        let i = 0
        return {
          next: async () => {
            if (i >= events.length) return { value: undefined, done: true }
            return { value: events[i++], done: false }
          },
        }
      },
      interrupt: mockInterrupt,
      close: () => {},
    }
  },
  registerExternalTool: (tool: any) => {
    mockRegisterExternalTool(tool)
    return () => {}
  },
}))

import { BriefAgent } from '../../../../../src/main/sdk/agents/briefAgent.js'

const baseSettings: any = {
  llm: { provider: 'anthropic', baseUrl: '', apiKey: '', model: 'm' },
  ui: { theme: 'light' },
  paths: { projectsDir: '' },
}

describe('BriefAgent', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockInterrupt.mockReset()
    mockRegisterExternalTool.mockReset()
    mockRegisterExternalTool.mockReturnValue(() => {})
  })

  it('happy path: question + answer + final JSON → onDone with brief', async () => {
    const finalJson = JSON.stringify({
      name: 'Test',
      audience: 'aud',
      durationMinutes: 10,
      content: 'c',
      style: 's',
    })
    const events: any[] = [
      { type: 'system', subtype: 'init' },
      { type: 'assistant', message: { content: [
        { type: 'text', text: 'Let me ask.' },
        { type: 'tool_use', name: 'AskUserQuestion', id: 't1', input: {
          questions: [{ question: '时长?', header: '时长', options: [{ label: '10分钟' }, { label: '30分钟' }], multiSelect: false }],
        }},
      ]}},
      { type: 'assistant', message: { content: [
        { type: 'text', text: 'Final: ' + finalJson },
      ]}},
      { type: 'result', subtype: 'success', duration_ms: 500 },
    ]
    let doneBrief: any = null
    const agent = new BriefAgent({
      cwd: '/tmp',
      settings: baseSettings,
      source: 'raw source',
      hint: null,
      sdkEvents: events,
      onQuestion: (q) => {
        setTimeout(() => agent.answer(q.qid, { cancelled: false, value: { '时长?': '30分钟' } }), 0)
      },
      onDone: (b) => { doneBrief = b },
      onError: (e) => { throw new Error('unexpected error: ' + e.message) },
    })
    await agent.run()
    expect(doneBrief).toBeTruthy()
    expect(doneBrief.name).toBe('Test')
    expect(doneBrief.audience).toBe('aud')
    expect(doneBrief.durationMinutes).toBe(10)
    expect(doneBrief.pageCountEst).toBeGreaterThan(0)
    // verify the system tool was registered with the SDK
    expect(mockRegisterExternalTool).toHaveBeenCalledTimes(1)
    const registeredTool = mockRegisterExternalTool.mock.calls[0][0]
    expect(registeredTool.name).toBe('BriefAskUser')
  })

  it('max_turns: 3rd call returns cancelled answer', async () => {
    let questionCount = 0
    let pendingQ: any = null
    const agent = new BriefAgent({
      cwd: '/tmp',
      settings: baseSettings,
      source: 's',
      hint: null,
      onQuestion: (q) => { questionCount++; pendingQ = q },
      onDone: () => {},
      onError: () => {},
    })
    const handler = (q: any) => (agent as any).__invokeAskHandlerForTest(q)
    // First call (turn 1)
    const p1 = handler({ questions: [{ question: 'q1', header: 'h', options: [{ label: 'a' }, { label: 'b' }], multiSelect: false }] })
    await new Promise(r => setTimeout(r, 5))
    expect(questionCount).toBe(1)
    agent.answer(pendingQ.qid, { cancelled: false, value: { 'q1': 'a' } })
    const r1 = await p1
    expect(r1.cancelled).toBe(false)

    // Second call (turn 2)
    const p2 = handler({ questions: [{ question: 'q2', header: 'h', options: [{ label: 'a' }, { label: 'b' }], multiSelect: false }] })
    await new Promise(r => setTimeout(r, 5))
    expect(questionCount).toBe(2)
    agent.answer(pendingQ.qid, { cancelled: false, value: { 'q2': 'a' } })
    const r2 = await p2
    expect(r2.cancelled).toBe(false)

    // 3rd call: should immediately return cancelled (max_turns)
    const r3 = await handler({ questions: [{ question: 'q3', header: 'h', options: [{ label: 'a' }, { label: 'b' }], multiSelect: false }] })
    expect(questionCount).toBe(2) // 3rd call should not increment
    expect(r3.cancelled).toBe(true)
    expect((r3 as any).reason).toBe('max_turns')
  })

  it('user cancel: answer with cancelled:true returns cancelled answer', async () => {
    let questionCount = 0
    const agent = new BriefAgent({
      cwd: '/tmp',
      settings: baseSettings,
      source: 's',
      hint: null,
      onQuestion: (q) => {
        questionCount++
        setTimeout(() => agent.answer(q.qid, { cancelled: true }), 0)
      },
      onDone: () => {},
      onError: () => {},
    })
    const handler = (q: any) => (agent as any).__invokeAskHandlerForTest(q)
    const r = await handler({ questions: [{ question: 'q', header: 'h', options: [{ label: 'a' }, { label: 'b' }], multiSelect: false }] })
    expect(questionCount).toBe(1)
    expect(r.cancelled).toBe(true)
  })
})
