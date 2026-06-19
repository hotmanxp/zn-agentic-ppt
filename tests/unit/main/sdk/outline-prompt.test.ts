import { describe, it, expect } from 'vitest'
import { buildOutlinePrompt } from '../../../../src/main/sdk/outline-prompt.js'

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
})
