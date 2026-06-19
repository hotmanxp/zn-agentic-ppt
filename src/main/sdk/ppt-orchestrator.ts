import { GenerationRunner } from './runner.js'
import { buildSlidePrompt, generateFrameworkHtml, generateLayoutHtml } from './ppt-framework.js'
import * as projectFs from '../fs/projects.js'
import type { OutlineSlide, Settings } from '../../shared/types.js'

export type SlideStatus = 'pending' | 'layout' | 'generating' | 'done' | 'failed'

export interface OrchestratorSlide {
  id: string
  title: string
  status: SlideStatus
  html?: string
  error?: string
  durationMs?: number
  retries?: number
}

export interface OrchestratorOptions {
  projectId: string
  outline: { slides: OutlineSlide[] }
  settings: Settings
  style?: unknown
  cwd: string
  concurrency?: number
  maxRetries?: number
  onSlideReady?: (slide: OrchestratorSlide) => void | Promise<void>
  onProgress?: (info: { completed: number; total: number; slideId: string; status: SlideStatus }) => void
  signal?: AbortSignal
}

export interface OrchestratorResult {
  completed: number
  failed: number
  total: number
  cancelled: boolean
}

/**
 * Drives the multi-slide PPT generation pipeline:
 *  1. Writes framework index.html (loads slides via fetch + DOM injection)
 *  2. Spawns a worker pool of N concurrent LLM calls (one per slide)
 *  3. On each slide completion, writes slides/<id>.html and fires onSlideReady
 *  4. Failed slides retry up to maxRetries times; persistent failures are
 *     marked 'failed' but don't stop other slides
 */
export async function runOrchestrator(opts: OrchestratorOptions): Promise<OrchestratorResult> {
  const concurrency = Math.max(1, opts.concurrency ?? 3)
  const maxRetries = Math.max(0, opts.maxRetries ?? 2)

  const slides: OrchestratorSlide[] = opts.outline.slides.map(s => ({
    id: s.id, title: s.title, status: 'pending',
  }))
  const total = slides.length

  // Step 1: write the framework HTML up front
  const frameworkHtml = generateFrameworkHtml({
    topic: opts.outline.slides[0]?.title ?? 'Presentation',
    slides: opts.outline.slides.map(s => ({ id: s.id, title: s.title })),
  })
  await projectFs.writeProjectFramework(opts.projectId, frameworkHtml)

  // Step 1b: write N layout placeholders immediately (no LLM)
  // so the user sees structure while the LLM fills content.
  for (const target of opts.outline.slides) {
    const layoutHtml = generateLayoutHtml(target)
    await projectFs.writeProjectSlide(opts.projectId, target.id, layoutHtml)
    const slide = slides.find(s => s.id === target.id)!
    slide.status = 'layout'
    slide.html = layoutHtml
    await opts.onSlideReady?.(slide)
    opts.onProgress?.({ completed: 0, total, slideId: target.id, status: 'layout' })
  }

  // Step 2: simple worker pool
  let completed = 0
  let failed = 0
  let cancelled = false
  const next = (): OrchestratorSlide | undefined => {
    if (opts.signal?.aborted) return undefined
    return slides.find(s => s.status === 'pending')
  }

  const onProgress = (slide: OrchestratorSlide) => {
    opts.onProgress?.({
      completed, total, slideId: slide.id, status: slide.status,
    })
  }

  const workers: Promise<void>[] = []
  for (let i = 0; i < concurrency; i++) {
    workers.push((async () => {
      while (!opts.signal?.aborted) {
        const slide = next()
        if (!slide) return
        slide.status = 'generating'
        onProgress(slide)
        const target = opts.outline.slides.find(s => s.id === slide.id)!
        const others = opts.outline.slides.filter(s => s.id !== slide.id).map(s => ({ id: s.id, title: s.title }))
        const systemPrompt = buildSlidePrompt(target, others, opts.style) + '\n\n请用你的文件工具 (Read / Write / Edit) 直接编辑 slides/' + slide.id + '.html 文件。空模板已经存在，请覆盖。完成后用文字回复 done。'
        const startedAt = Date.now()

        let success = false
        let lastError: string | null = null
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          if (opts.signal?.aborted) return
          slide.retries = attempt
          try {
            const html = await runSingleSlide({
              cwd: opts.cwd,
              settings: opts.settings,
              systemPrompt,
              runId: `${opts.projectId}:${slide.id}`,
              signal: opts.signal,
            })
            slide.html = html
            slide.status = 'done'
            slide.durationMs = Date.now() - startedAt
            success = true
            break
          } catch (e: any) {
            lastError = e?.message ?? String(e)
            if (opts.signal?.aborted) return
            if (attempt < maxRetries) await sleep(500 * (attempt + 1))
          }
        }

        if (success) {
          completed++
          await opts.onSlideReady?.(slide)
        } else {
          failed++
          slide.status = 'failed'
          slide.error = lastError ?? 'unknown error'
          await opts.onSlideReady?.(slide)
        }
        onProgress(slide)
      }
    })())
  }

  await Promise.all(workers)
  cancelled = !!opts.signal?.aborted

  return { completed, failed, total, cancelled }
}

async function runSingleSlide(opts: {
  cwd: string
  settings: Settings
  systemPrompt: string
  runId: string
  signal?: AbortSignal
  userMessage?: string
  mcpServers?: Record<string, unknown>
}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new Error('aborted'))
    const slideId = opts.runId.split(':').pop() ?? ''
    const userMsg = opts.userMessage ?? '请使用 mcp__slides__write_slide_file 工具把这一页 PPT 的 HTML 写入 slides/' + slideId + '.html（空模板已存在，请覆盖）。'
    const runner = new GenerationRunner({
      cwd: opts.cwd,
      topic: '',
      outline: '',
      settings: opts.settings,
      runId: opts.runId,
      systemPrompt: opts.systemPrompt,
      userMessage: userMsg,
      mcpServers: opts.mcpServers,
      onEvent: () => {},
      onProgress: () => {},
      onDone: () => {},
      onError: ({ error }) => reject(new Error(error.message)),
    })
    const onAbort = () => runner.interrupt()
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    runner.run().then(async () => {
      opts.signal?.removeEventListener('abort', onAbort)
      if (opts.signal?.aborted) return reject(new Error('aborted'))
      // Read back the file the agent wrote via the MCP tool
      const { readFile } = await import('node:fs/promises')
      const safe = slideId.replace(/[^a-zA-Z0-9_-]/g, '_')
      const path = `${opts.cwd}/slides/${safe}.html`
      try {
        const html = await readFile(path, 'utf8')
        resolve(html)
      } catch (e: any) {
        reject(new Error(`agent did not write slides/${safe}.html: ${e?.message ?? e}`))
      }
    }).catch(reject)
  })
}
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
