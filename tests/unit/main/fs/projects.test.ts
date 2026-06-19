import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  listProjects, getProject, createProject, updateProject, deleteProject, writeProjectHtml,
} from '../../../../src/main/fs/projects.js'
import { setProjectsDirForTest } from '../../../../src/main/fs/paths.js'

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
