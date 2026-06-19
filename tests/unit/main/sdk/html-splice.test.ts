import { describe, it, expect } from 'vitest'
import { spliceSlide, findSlideIds } from '../../../../src/main/sdk/html-splice.js'

const SAMPLE = `<!DOCTYPE html>
<html><body>
<section data-id="s1" class="slide"><h1>A</h1></section>
<section data-id="s2" class="slide"><h1>B</h1></section>
<section data-id="s3" class="slide"><h1>C</h1></section>
</body></html>`

describe('spliceSlide', () => {
  it('replaces one section by id', () => {
    const r = spliceSlide(SAMPLE, 's2', '<section data-id="s2" class="slide"><h1>B-NEW</h1></section>')
    expect(r).toContain('<h1>B-NEW</h1>')
    expect(r).toContain('<h1>A</h1>')
    expect(r).toContain('<h1>C</h1>')
  })
  it('returns original when id not found', () => {
    const r = spliceSlide(SAMPLE, 's99', 'whatever')
    expect(r).toBe(SAMPLE)
  })
  it('replaces only the matching section, not all', () => {
    const r = spliceSlide(SAMPLE, 's1', '<section data-id="s1" class="slide">REPLACED</section>')
    expect(r).toContain('REPLACED')
    // s2 and s3 remain unchanged
    expect(r).toContain('<h1>B</h1>')
    expect(r).toContain('<h1>C</h1>')
  })
})

describe('findSlideIds', () => {
  it('extracts all section data-ids in order', () => {
    expect(findSlideIds(SAMPLE)).toEqual(['s1', 's2', 's3'])
  })
  it('returns empty for html without sections', () => {
    expect(findSlideIds('<html><body>no sections</body></html>')).toEqual([])
  })
})
