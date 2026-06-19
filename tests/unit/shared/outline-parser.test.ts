import { describe, it, expect } from 'vitest'
import { parseOutline, splitIntoSlides } from '../../../src/shared/outline-parser.js'

describe('parseOutline', () => {
  it('returns 0 pages for empty input', () => {
    expect(parseOutline('')).toBe(0)
  })
  it('counts h1 headings only', () => {
    const md = '# A\n## sub\n- item\n# B\n## sub2\n# C'
    expect(parseOutline(md)).toBe(3)
  })
  it('ignores h1 inside code fences', () => {
    const md = '```\n# not-a-heading\n```\n# real'
    expect(parseOutline(md)).toBe(1)
  })
})

describe('splitIntoSlides', () => {
  it('returns single empty slide for no headings', () => {
    expect(splitIntoSlides('just some text')).toEqual([{ title: 'Slide 1', body: 'just some text' }])
  })
  it('splits on each h1', () => {
    const md = '# A\nbody a\n# B\nbody b'
    expect(splitIntoSlides(md)).toEqual([
      { title: 'A', body: 'body a' },
      { title: 'B', body: 'body b' },
    ])
  })
})
