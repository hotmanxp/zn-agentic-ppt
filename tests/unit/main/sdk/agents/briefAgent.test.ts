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

import { BriefAgent, parseAskUserBlock } from '../../../../../src/main/sdk/agents/briefAgent.js'

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

  it('happy path: question + answer + final markdown → onDone with brief.markdown', async () => {
    const finalMarkdown = [
      '# Test',
      '',
      '## 演讲对象和场景',
      'aud',
      '',
      '## 演讲时长(分钟)',
      '10',
      '',
      '## 演讲内容',
      'c',
      '',
      '## 整体风格',
      's',
    ].join('\n')
    const events: any[] = [
      { type: 'system', subtype: 'init' },
      { type: 'assistant', message: { content: [
        { type: 'text', text: 'Let me ask.' },
        { type: 'tool_use', name: 'BriefAskUser', id: 't1', input: {
          questions: [{ question: '时长?', header: '时长', options: [{ label: '10分钟' }, { label: '30分钟' }], multiSelect: false }],
        }},
      ]}},
      { type: 'assistant', message: { content: [
        { type: 'text', text: 'Final:\n' + finalMarkdown },
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
    expect(typeof doneBrief.markdown).toBe('string')
    expect(doneBrief.markdown).toContain('# Test')
    expect(doneBrief.markdown).toContain('## 演讲时长(分钟)')
    expect(doneBrief.markdown).toContain('10')
    // LLM prose preamble is kept verbatim (no parsing/trimming).
    expect(doneBrief.markdown).toContain('Let me ask.')
    // verify the system tool was registered with the SDK
    expect(mockRegisterExternalTool).toHaveBeenCalledTimes(1)
    const registeredTool = mockRegisterExternalTool.mock.calls[0][0]
    expect(registeredTool.name).toBe('BriefAskUser')
  })

  it('passes the raw LLM output through (no validation)', async () => {
    const raw = 'Sure! Here you go:\n\n# Slide deck\n\n## Section A\nstuff'
    const events: any[] = [
      { type: 'system', subtype: 'init' },
      { type: 'assistant', message: { content: [
        { type: 'text', text: raw },
      ]}},
      { type: 'result', subtype: 'success', duration_ms: 500 },
    ]
    let doneBrief: any = null
    let err: any = null
    const agent = new BriefAgent({
      cwd: '/tmp',
      settings: baseSettings,
      source: 's',
      hint: null,
      sdkEvents: events,
      onDone: (b) => { doneBrief = b },
      onError: (e) => { err = e },
    })
    await agent.run()
    expect(err).toBeNull()
    expect(doneBrief.markdown).toBe(raw)
  })

  it('empty buffer becomes empty string (no error)', async () => {
    const events: any[] = [
      { type: 'system', subtype: 'init' },
      { type: 'assistant', message: { content: [
        { type: 'text', text: '   ' },
      ]}},
      { type: 'result', subtype: 'success', duration_ms: 500 },
    ]
    let doneBrief: any = null
    let err: any = null
    const agent = new BriefAgent({
      cwd: '/tmp',
      settings: baseSettings,
      source: 's',
      hint: null,
      sdkEvents: events,
      onDone: (b) => { doneBrief = b },
      onError: (e) => { err = e },
    })
    await agent.run()
    expect(err).toBeNull()
    expect(doneBrief.markdown).toBe('')
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

  it('XML <briefaskuser> tag triggers onQuestion and emits final markdown after answer', async () => {
    const askJson = JSON.stringify({
      questions: [
        { question: '听众?', header: '听众', options: [{ label: '开发者' }, { label: '管理者' }], multiSelect: false },
      ],
    })
    // First turn: emit ask-user block. Second turn: emit final markdown
    // (but with the mock iterator draining all events in one run, the
    // buffer accumulates both, so we assert both surfaces are touched).
    const finalMd = '# AI Agent 演进\n\n## 演讲对象和场景\n开发者大会'
    const events: any[] = [
      { type: 'system', subtype: 'init' },
      { type: 'assistant', message: { content: [
        { type: 'text', text: '让我先问问:\n\n<briefaskuser>' + askJson + '</briefaskuser>' },
      ]}},
      { type: 'assistant', message: { content: [
        { type: 'text', text: finalMd },
      ]}},
      { type: 'result', subtype: 'success', duration_ms: 500 },
    ]
    let capturedQ: any = null
    let doneBrief: any = null
    const agent = new BriefAgent({
      cwd: '/tmp',
      settings: baseSettings,
      source: 's',
      hint: null,
      sdkEvents: events,
      onQuestion: (q) => {
        capturedQ = q
        setTimeout(() => agent.answer(q.qid, { cancelled: false, value: { '听众?': '开发者' } }), 0)
      },
      onDone: (b) => { doneBrief = b },
      onError: (e) => { throw new Error('unexpected error: ' + e.message) },
    })
    await agent.run()
    // OnQuestion was called with the parsed questions at least once.
    // (The mock iterator drains both events in one SDK turn, so the
    // agent may detect the ask block twice — we only assert the first
    // call captured the right question.)
    expect(capturedQ).toBeTruthy()
    expect(capturedQ.questions[0].question).toBe('听众?')
    // Final markdown contains the LLM's text
    expect(doneBrief.markdown).toContain(finalMd)
  })
})

describe('parseAskUserBlock', () => {
  const askJson = JSON.stringify({
    questions: [
      { question: 'Q?', header: 'h', options: [{ label: 'a' }, { label: 'b' }], multiSelect: false },
    ],
  })

  it('parses lowercase <briefaskuser> tag', () => {
    const r = parseAskUserBlock(`<briefaskuser>${askJson}</briefaskuser>`)
    expect(r).toBeTruthy()
    expect(r!.questions[0].question).toBe('Q?')
  })

  it('parses PascalCase <BriefAskUser> tag', () => {
    const r = parseAskUserBlock(`<BriefAskUser>${askJson}</BriefAskUser>`)
    expect(r).toBeTruthy()
    expect(r!.questions[0].header).toBe('h')
  })

  it('returns null when no tag is present', () => {
    expect(parseAskUserBlock('just plain markdown')).toBeNull()
  })

  it('returns null when tag content is not valid JSON', () => {
    expect(parseAskUserBlock('<briefaskuser>not json</briefaskuser>')).toBeNull()
  })

  it('returns null when JSON has no questions array', () => {
    expect(parseAskUserBlock('<briefaskuser>{}</briefaskuser>')).toBeNull()
  })

  it('extracts from surrounding prose', () => {
    const text = `让我先问:\n<briefaskuser>${askJson}</briefaskuser>\n谢谢`
    const r = parseAskUserBlock(text)
    expect(r!.questions[0].question).toBe('Q?')
  })

  it('parses bare JSON object {"questions": [...]}', () => {
    const r = parseAskUserBlock(askJson)
    expect(r).toBeTruthy()
    expect(r!.questions[0].question).toBe('Q?')
  })

  it('parses bare JSON object surrounded by prose', () => {
    const text = `让我先问:\n${askJson}\n谢谢`
    const r = parseAskUserBlock(text)
    expect(r!.questions[0].question).toBe('Q?')
  })

  it('handles the actual LLM output format: <briefaskuser><questions>[...]</questions></briefaskuser>', () => {
    const text = `<briefaskuser>
<questions>[{"header":"演讲对象","options":[{"label":"开发者"},{"label":"管理者"}],"question":"听众是谁?","multiselect":false}]</questions>
</briefaskuser>`
    const r = parseAskUserBlock(text)
    expect(r).toBeTruthy()
    expect(r!.questions[0].question).toBe('听众是谁?')
    expect(r!.questions[0].options).toHaveLength(2)
  })

  it('returns null when no questions JSON is present at all', () => {
    expect(parseAskUserBlock('# Final markdown\n\n## Section\njust text')).toBeNull()
  })
})