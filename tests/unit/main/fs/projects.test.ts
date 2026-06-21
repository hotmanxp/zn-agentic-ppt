import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  listProjects, getProject, createProject, updateProject, deleteProject, writeProjectHtml,
  readProjectBrief, writeProjectBrief,
} from '../../../../src/main/fs/projects.js'
import { setProjectsDirForTest } from '../../../../src/main/fs/paths.js'
import type { ProjectBrief } from '../../../../src/shared/types.js'

describe('fs/projects', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'znap-test-'))
    setProjectsDirForTest(dir)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('createProject returns meta and writes meta.json', async () => {
    const meta = await createProject('test topic')
    expect(meta.topic).toBe('test topic')
    expect(meta.status).toBe('draft')
    expect(existsSync(join(dir, meta.id, 'meta.json'))).toBe(true)
  })

  it('listProjects returns sorted by updatedAt desc', async () => {
    const a = await createProject('a')
    await new Promise(r => setTimeout(r, 5))
    const b = await createProject('b')
    const list = await listProjects()
    expect(list[0].id).toBe(b.id)
    expect(list[1].id).toBe(a.id)
  })

  it('getProject returns detail with html=null initially', async () => {
    const meta = await createProject('x')
    const detail = await getProject(meta.id)
    expect(detail?.html).toBe(null)
    expect(detail?.htmlSize).toBe(null)
  })

  it('updateProject mutates allowed fields', async () => {
    const meta = await createProject('x')
    const updated = await updateProject(meta.id, { title: 'new', topic: 'new topic' })
    expect(updated.title).toBe('new')
    expect(updated.topic).toBe('new topic')
  })

  it('updateProject rejects non-allowed fields', async () => {
    const meta = await createProject('x')
    await expect(
      updateProject(meta.id, { status: 'generated' } as any)
    ).rejects.toThrow(/not allowed/)
  })

  it('deleteProject removes directory', async () => {
    const meta = await createProject('x')
    await deleteProject(meta.id)
    expect(existsSync(join(dir, meta.id))).toBe(false)
  })

  it('writeProjectHtml uses atomic tmp→rename', async () => {
    const meta = await createProject('x')
    await writeProjectHtml(meta.id, '<html>hello</html>')
    const detail = await getProject(meta.id)
    expect(detail?.html).toBe('<html>hello</html>')
    expect(detail?.htmlSize).toBe(18)
    expect(detail?.status).toBe('generated')
  })

  it('getProject returns null for missing id', async () => {
    expect(await getProject('nonexistent')).toBe(null)
  })
})

describe('getProject merge', () => {
  let dir: string
  let projectId: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'znap-merge-'))
    setProjectsDirForTest(dir)
    projectId = randomUUID()
    mkdirSync(join(dir, projectId), { recursive: true })
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const writeMeta = (id: string, extra: Record<string, unknown> = {}) => {
    const meta = {
      id, title: 't', topic: 'tp', status: 'draft', outline: '',
      pageCount: null, createdAt: 1, updatedAt: 1, currentStage: 'idle',
      hasSource: false, hasOutline: false, hasHtml: false,
      ...extra,
    }
    writeFileSync(join(dir, id, 'meta.json'), JSON.stringify(meta))
  }

  it('returns null when meta.json missing', async () => {
    const id = randomUUID()
    mkdirSync(join(dir, id), { recursive: true })
    const result = await getProject(id)
    expect(result).toBeNull()
  })

  it('reads meta only when other files missing', async () => {
    writeMeta(projectId)
    const result = await getProject(projectId)
    expect(result?.source).toBeNull()
    expect(result?.structuredOutline).toBeNull()
    expect(result?.style).not.toBeNull()
    expect(result?.slides).toEqual([])
  })

  it('reads source.txt when present', async () => {
    writeMeta(projectId, { hasSource: true })
    writeFileSync(join(dir, projectId, 'source.txt'), 'hello world')
    const result = await getProject(projectId)
    expect(result?.source).toBe('hello world')
  })

  it('reads structured outline from outline.json', async () => {
    writeMeta(projectId, { hasOutline: true })
    writeFileSync(join(dir, projectId, 'outline.json'), JSON.stringify({
      slides: [{ id: 's1', title: 'T', bullets: ['a'] }],
      generatedAt: 1700000000,
    }))
    const result = await getProject(projectId)
    expect(result?.structuredOutline?.slides[0].id).toBe('s1')
  })

  it('reads per-slide HTML files', async () => {
    writeMeta(projectId, { pageCount: 2, hasOutline: true, hasHtml: true })
    const slidesDir = join(dir, projectId, 'slides')
    mkdirSync(slidesDir, { recursive: true })
    writeFileSync(join(slidesDir, 's1.html'), '<section data-id="s1">hi</section>')
    writeFileSync(join(slidesDir, 's2.html'), '<section data-id="s2">bye</section>')
    const result = await getProject(projectId)
    expect(result?.slides).toHaveLength(2)
    expect(result?.slides.find(s => s.id === 's1')?.html).toContain('hi')
    expect(result?.slides.every(s => s.status === 'done')).toBe(true)
  })

  it('falls back to DEFAULT_STYLE when style.json missing', async () => {
    writeMeta(projectId)
    const result = await getProject(projectId)
    expect(result?.style).toEqual({
      primaryColor: '#FF6600',
      layout: 'minimal',
      fontFamily: '-apple-system, sans-serif',
    })
  })
})

describe('brief persistence', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'znap-brief-'))
    setProjectsDirForTest(dir)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('readProjectBrief returns null when brief.md missing', async () => {
    const meta = await createProject('topic')
    expect(await readProjectBrief(meta.id)).toBeNull()
  })

  it('writeProjectBrief + readProjectBrief round-trips', async () => {
    const meta = await createProject('topic')
    const brief: ProjectBrief = { markdown: '# N\n\n## 演讲对象和场景\na\n\n## 演讲时长(分钟)\n30\n\n## 演讲内容\nc\n\n## 整体风格\ns' }
    await writeProjectBrief(meta.id, brief)
    expect(await readProjectBrief(meta.id)).toEqual(brief)
  })

  it('getProject includes brief when brief.md exists', async () => {
    const meta = await createProject('topic')
    const brief: ProjectBrief = { markdown: '# N\n\n## 演讲对象和场景\na\n' }
    await writeProjectBrief(meta.id, brief)
    const detail = await getProject(meta.id)
    expect(detail?.brief).toEqual(brief)
  })
})
