import { describe, it, expect } from 'vitest'
import { buildOutlinePrompt, parseOutlineResponse } from '../../../../src/main/sdk/outline-prompt.js'

describe('buildOutlinePrompt', () => {
  it('includes topic', () => {
    const p = buildOutlinePrompt('2026 路线图', 'Q1 重点...')
    expect(p).toContain('2026 路线图')
  })
  it('includes source content', () => {
    const p = buildOutlinePrompt('Topic', 'SOURCE_CONTENT_HERE')
    expect(p).toContain('SOURCE_CONTENT_HERE')
  })
  it('requests JSON output', () => {
    const p = buildOutlinePrompt('T', 'S')
    expect(p).toContain('JSON')
    expect(p).toContain('slides')
  })
  it('requires cover on first slide and closing on last', () => {
    const p = buildOutlinePrompt('T', 'S')
    expect(p).toContain('cover')
    expect(p).toContain('closing')
  })
  it('specifies global style palette', () => {
    const p = buildOutlinePrompt('T', 'S')
    expect(p).toContain('#1677ff')
    expect(p).toContain('#722ed1')
  })
})

describe('parseOutlineResponse', () => {
  // Helper to build a realistic LLM response
  const llmObject = (slides: any[], wrap = true) => {
    const obj = {
      globalStyle: { primaryColor: '#1677ff', accentColor: '#722ed1' },
      slides,
    }
    const json = JSON.stringify(obj, null, 2)
    return wrap ? '```json\n' + json + '\n```' : json
  }

  it('parses markdown-fenced JSON object', () => {
    const raw = llmObject([
      { title: 'A', bullets: ['x'] },
      { title: 'B', bullets: ['y'] },
    ])
    const out = parseOutlineResponse(raw)
    expect(out.slides).toHaveLength(2)
    expect(out.slides[0].title).toBe('A')
    expect(out.slides[0].bullets).toEqual(['x'])
  })

  it('preserves globalStyle from LLM output', () => {
    const raw = llmObject([
      { title: 'A', bullets: ['x'] },
      { title: 'B', bullets: ['y'] },
    ])
    const out = parseOutlineResponse(raw)
    expect(out.globalStyle?.primaryColor).toBe('#1677ff')
    expect(out.globalStyle?.accentColor).toBe('#722ed1')
  })

  it('forces first slide layout = cover', () => {
    const raw = llmObject([
      { title: 'Intro', bullets: ['x'] }, // LLM forgot to set layout=cover
      { title: 'B', bullets: ['y'] },
    ])
    const out = parseOutlineResponse(raw)
    expect(out.slides[0].layout).toBe('cover')
  })

  it('forces last slide layout = closing', () => {
    const raw = llmObject([
      { title: 'A', bullets: ['x'] },
      { title: 'B', bullets: ['y'] }, // LLM forgot to set layout=closing
    ])
    const out = parseOutlineResponse(raw)
    expect(out.slides[out.slides.length - 1].layout).toBe('closing')
  })

  it('preserves middle slide layouts from LLM', () => {
    const raw = llmObject([
      { title: 'A', bullets: ['x'] },
      { title: 'B', bullets: ['y'], layout: 'stats' },
      { title: 'C', bullets: ['z'] },
    ])
    const out = parseOutlineResponse(raw)
    expect(out.slides[1].layout).toBe('stats')
  })

  it('strips ```json fences and trailing commentary', () => {
    const raw = 'Here you go:\n```json\n{"slides":[{"title":"A","bullets":["x"]}]}\n```\nLet me know if changes needed.'
    const out = parseOutlineResponse(raw)
    expect(out.slides).toHaveLength(1)
    expect(out.slides[0].title).toBe('A')
  })

  it('returns empty outline on completely malformed input', () => {
    const out = parseOutlineResponse('no json at all, sorry')
    expect(out.slides).toEqual([])
  })

  it('returns empty outline on empty buffer', () => {
    const out = parseOutlineResponse('')
    expect(out.slides).toEqual([])
  })

  it('skips slides with empty title or bullets', () => {
    const raw = llmObject([
      { title: '', bullets: ['x'] },           // empty title → skip
      { title: 'A', bullets: [] },             // empty bullets → skip
      { title: 'OK', bullets: ['y'] },
    ])
    const out = parseOutlineResponse(raw)
    expect(out.slides).toHaveLength(1)
    expect(out.slides[0].title).toBe('OK')
  })

  it('assigns unique ids to each slide', () => {
    const raw = llmObject([
      { title: 'A', bullets: ['x'] },
      { title: 'B', bullets: ['y'] },
    ])
    const out = parseOutlineResponse(raw)
    expect(out.slides[0].id).not.toBe(out.slides[1].id)
  })

  it('preserves notes when LLM provides them', () => {
    const raw = llmObject([
      { title: 'A', bullets: ['x'], notes: 'extra context' },
    ])
    const out = parseOutlineResponse(raw)
    expect(out.slides[0].notes).toBe('extra context')
  })

  it('works without globalStyle field', () => {
    const json = JSON.stringify({ slides: [{ title: 'A', bullets: ['x'] }] })
    const out = parseOutlineResponse('```json\n' + json + '\n```')
    expect(out.slides).toHaveLength(1)
    expect(out.globalStyle).toBeUndefined()
  })

  it('returns empty when JSON is balanced but not parseable', () => {
    const out = parseOutlineResponse('{"slides": [invalid json}')
    expect(out.slides).toEqual([])
  })

  it('extracts JSON even with leading prose and trailing markdown', () => {
    const raw = 'Sure! Here is your outline:\n\n```json\n{"slides":[{"title":"A","bullets":["x"]}]}\n```\n\nHope this helps!'
    const out = parseOutlineResponse(raw)
    expect(out.slides).toHaveLength(1)
    expect(out.slides[0].title).toBe('A')
  })
})
