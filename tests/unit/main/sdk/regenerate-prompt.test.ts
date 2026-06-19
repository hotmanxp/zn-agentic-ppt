import { describe, it, expect } from 'vitest'
import { buildRegeneratePrompt } from '../../../../src/main/sdk/regenerate-prompt.js'

describe('buildRegeneratePrompt', () => {
  it('includes the target slide', () => {
    const p = buildRegeneratePrompt(
      { id: 's2', title: 'T2', bullets: ['b'] },
      [{ id: 's1', title: 'T1' }, { id: 's2', title: 'T2' }],
      '<section data-id="s2">OLD</section>',
    )
    expect(p).toContain('s2')
    expect(p).toContain('T2')
  })
  it('includes other slides for context', () => {
    const p = buildRegeneratePrompt(
      { id: 's1', title: 'A', bullets: [] },
      [{ id: 's1', title: 'A' }, { id: 's2', title: 'B' }],
      ''
    )
    expect(p).toContain('s2')
  })
  it('requests <section> only output', () => {
    const p = buildRegeneratePrompt(
      { id: 's1', title: 'T', bullets: [] }, [], ''
    )
    expect(p).toContain('<section')
  })
})
