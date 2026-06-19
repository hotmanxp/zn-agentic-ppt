import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import {
  readOutline, writeOutline, readSource, writeSource, readStyle, writeStyle,
  updateSlide, addSlide, deleteSlide,
} from '../../../../src/main/fs/outline.js'
import { setProjectsDirForTest } from '../../../../src/main/fs/paths.js'

describe('fs/outline', () => {
  let dir: string
  let projectId: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zn-outline-'))
    projectId = 'p1'
    setProjectsDirForTest(dir)
    mkdirSync(join(dir, projectId), { recursive: true })
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('readOutline returns null when missing', async () => {
    expect(await readOutline(projectId)).toBe(null)
  })

  it('writeOutline then readOutline round-trips', async () => {
    const outline = { slides: [{ id: 's1', title: 'T', bullets: ['b1', 'b2'] }], generatedAt: 1000 }
    await writeOutline(projectId, outline)
    expect(await readOutline(projectId)).toEqual(outline)
  })

  it('readSource/writeSource work', async () => {
    expect(await readSource(projectId)).toBe('')
    await writeSource(projectId, 'hello world')
    expect(await readSource(projectId)).toBe('hello world')
  })

  it('readStyle returns DEFAULT_STYLE when missing', async () => {
    const s = await readStyle(projectId)
    expect(s.primaryColor).toBe('#1677ff')
  })

  it('writeStyle then readStyle round-trips', async () => {
    await writeStyle(projectId, { primaryColor: '#ff0000', layout: 'fullbg', fontFamily: 'serif' })
    expect((await readStyle(projectId)).primaryColor).toBe('#ff0000')
  })

  it('updateSlide patches one slide', async () => {
    await writeOutline(projectId, { slides: [{ id: 's1', title: 'A', bullets: ['x'] }], generatedAt: 1 })
    const updated = await updateSlide(projectId, 's1', { title: 'B' })
    expect(updated.slides[0].title).toBe('B')
    expect(updated.slides[0].bullets).toEqual(['x'])
  })

  it('addSlide appends with new uuid', async () => {
    await writeOutline(projectId, { slides: [], generatedAt: 1 })
    const r = await addSlide(projectId)
    expect(r.slides).toHaveLength(1)
    expect(r.slides[0].title).toBe('新幻灯片')
  })

  it('deleteSlide removes by id', async () => {
    await writeOutline(projectId, { slides: [
      { id: 's1', title: 'A', bullets: [] },
      { id: 's2', title: 'B', bullets: [] },
    ], generatedAt: 1 })
    const r = await deleteSlide(projectId, 's1')
    expect(r.slides.map(s => s.id)).toEqual(['s2'])
  })
})
