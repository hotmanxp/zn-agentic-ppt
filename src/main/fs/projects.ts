import { mkdir, readFile, readdir, rm, writeFile, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ProjectDetail, ProjectMeta, ProjectStatus } from '../../shared/types.js'
import { getProjectsDir } from './paths.js'

const ALLOWED_UPDATE_KEYS = ['title', 'topic', 'outline'] as const

export async function listProjects(): Promise<ProjectMeta[]> {
  const dir = getProjectsDir()
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const metas: ProjectMeta[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    try {
      const raw = await readFile(join(dir, e.name, 'meta.json'), 'utf8')
      metas.push(JSON.parse(raw))
    } catch { /* skip corrupt */ }
  }
  metas.sort((a, b) => b.updatedAt - a.updatedAt)
  return metas
}

export async function getProject(id: string): Promise<ProjectDetail | null> {
  const dir = join(getProjectsDir(), id)
  if (!existsSync(dir)) return null
  try {
    const metaRaw = await readFile(join(dir, 'meta.json'), 'utf8')
    const meta = JSON.parse(metaRaw) as ProjectMeta
    let html: string | null = null
    let htmlSize: number | null = null
    const htmlPath = join(dir, 'index.html')
    if (existsSync(htmlPath)) {
      html = await readFile(htmlPath, 'utf8')
      htmlSize = html.length
    }
    return { ...meta, html, htmlSize, lastGeneratedAt: html ? meta.updatedAt : null, lastError: null }
  } catch {
    return null
  }
}

export async function createProject(topic: string): Promise<ProjectMeta> {
  const id = randomUUID()
  const now = Date.now()
  const meta: ProjectMeta = {
    id, topic,
    title: topic.slice(0, 40) || 'Untitled',
    status: 'draft',
    outline: '',
    pageCount: null,
    createdAt: now, updatedAt: now,
  }
  const dir = join(getProjectsDir(), id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'meta.json'), JSON.stringify(meta, null, 2))
  await writeFile(join(dir, 'outline.md'), '')
  return meta
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<ProjectMeta, 'title' | 'topic' | 'outline'>>,
): Promise<ProjectMeta> {
  for (const k of Object.keys(patch)) {
    if (!ALLOWED_UPDATE_KEYS.includes(k as any)) {
      throw new Error(`Field "${k}" is not allowed in updateProject`)
    }
  }
  const existing = await getProject(id)
  if (!existing) throw new Error(`Project ${id} not found`)
  const next: ProjectMeta = { ...existing, ...patch, updatedAt: Date.now() }
  await writeFile(join(getProjectsDir(), id, 'meta.json'), JSON.stringify(next, null, 2))
  if (patch.outline !== undefined) {
    await writeFile(join(getProjectsDir(), id, 'outline.md'), patch.outline)
  }
  return next
}

export async function deleteProject(id: string): Promise<void> {
  await rm(join(getProjectsDir(), id), { recursive: true, force: true })
}

export async function writeProjectHtml(id: string, html: string): Promise<void> {
  const dir = join(getProjectsDir(), id)
  const tmpPath = join(dir, 'index.html.tmp')
  const finalPath = join(dir, 'index.html')
  await writeFile(tmpPath, html)
  await rename(tmpPath, finalPath)
  const existing = await getProject(id)
  if (existing) {
    const next: ProjectMeta = {
      ...existing, status: 'generated' as ProjectStatus,
      updatedAt: Date.now(), pageCount: existing.pageCount,
    }
    await writeFile(join(dir, 'meta.json'), JSON.stringify(next, null, 2))
  }
}

export async function setProjectStatus(id: string, status: ProjectStatus, errorMessage?: string): Promise<void> {
  const dir = join(getProjectsDir(), id)
  const metaPath = join(dir, 'meta.json')
  const existing = await readFile(metaPath, 'utf8')
  const meta = JSON.parse(existing) as ProjectMeta
  // meta.json stores the on-disk record; lastError is a transient field
  // not on ProjectMeta per spec, so we cast to allow it.
  const next = {
    ...meta,
    status,
    lastError: errorMessage ?? null,
    updatedAt: Date.now(),
  }
  await writeFile(metaPath, JSON.stringify(next, null, 2))
}
