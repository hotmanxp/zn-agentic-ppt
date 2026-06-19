import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import { GenerationRunner } from '../sdk/runner.js'
import { buildOutlinePrompt } from '../sdk/outline-prompt.js'
import { buildRegeneratePrompt } from '../sdk/regenerate-prompt.js'
import { spliceSlide } from '../sdk/html-splice.js'
import * as outlineFs from '../fs/outline.js'
import * as projectFs from '../fs/projects.js'
import * as settingsFs from '../fs/settings.js'
import { getProjectDir } from '../fs/paths.js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { OutlineSlide, StyleSettings } from '../../shared/types.js'

function broadcast(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload)
  }
}

import { registry } from './stage-stream-registry.js'
import { extractFirstJsonObject } from '../sdk/json-extract.js'

async function loadSettingsAndOutline(id: string) {
  const settings = await settingsFs.getSettings()
  const project = await projectFs.getProject(id)
  if (!project) throw new Error('project not found')
  const outline = await outlineFs.readOutline(id)
  if (!outline) throw new Error('outline not found')
  return { settings, project, outline }
}

export function registerStageIPC() {
  ipcMain.handle(IPC.STAGE_COLLECT_SAVE, async (_, { id, topic, source }: { id: string; topic: string; source: string }) => {
    await outlineFs.writeSource(id, source)
    const existing = await projectFs.getProject(id)
    if (existing) {
      await projectFs.updateProject(id, { topic })
    }
  })

  ipcMain.handle(IPC.STAGE_OUTLINE_GENERATE, async (_, { id }: { id: string }) => {
    const project = await projectFs.getProject(id)
    if (!project) throw new Error('project not found')
    const source = await outlineFs.readSource(id)
    if (!source.trim()) throw new Error('empty source')
    const settings = await settingsFs.getSettings()
    const cwd = getProjectDir(id)
    const key = id
    let buffer = ''
    const runner = new GenerationRunner({
      cwd, topic: project.topic, outline: source, settings, runId: id,
      systemPrompt: buildOutlinePrompt(project.topic, source),
      userMessage: '请根据以上指令生成大纲。',
      onEvent: () => {},
      onProgress: (info) => broadcast(IPC.STAGE_OUTLINE_STREAM, {
        runId: key, projectId: id, kind: 'outline', phase: 'streaming', chars: info.current,
      }),
      onDone: ({ html, durationMs }) => {
        buffer = html
        broadcast(IPC.STAGE_OUTLINE_STREAM, {
          runId: key, projectId: id, kind: 'outline', phase: 'done', chars: html.length, html, durationMs,
        })
        registry.unregister(key)
      },
      onError: ({ error }) => {
        const phase = registry.isCancelled(key) ? 'cancelled' : 'error'
        broadcast(IPC.STAGE_OUTLINE_STREAM, { runId: key, projectId: id, kind: 'outline', phase, error })
        registry.unregister(key)
        if (phase === 'error') throw new Error(error.message)
      },
    })
    registry.register(key, runner, 'outline')
    await runner.run()
    if (registry.isCancelled(key)) {
      return { phase: 'cancelled' as const }
    }
    let parsed: { slides: OutlineSlide[] }
    try {
      parsed = extractFirstJsonObject<{ slides: OutlineSlide[] }>(buffer)
    } catch (e: any) {
      console.log(`[outline:${id}] JSON extraction failed: ${e?.message ?? e}`)
      console.log(`[outline:${id}] LLM buffer (first 800 chars): ${buffer.slice(0, 800)}`)
      console.log(`[outline:${id}] LLM buffer length: ${buffer.length}`)
      throw e
    }
    console.log(`[outline:${id}] parsed ${JSON.stringify(parsed).length} chars, slides=${parsed.slides?.length ?? '?'}`)
    if (!Array.isArray(parsed.slides) || parsed.slides.length === 0) {
      console.log(`[outline:${id}] LLM buffer (first 500 chars): ${buffer.slice(0, 500)}`)
      throw new Error('LLM 返回的 JSON 不包含 slides 数组或 slides 为空')
    }
    await outlineFs.writeOutline(id, { slides: parsed.slides, generatedAt: Date.now() })
    return { phase: 'done' as const, slides: parsed.slides }
  })

  ipcMain.handle(IPC.STAGE_OUTLINE_UPDATE, async (_, { id, slideId, patch }: { id: string; slideId: string; patch: any }) => {
    return await outlineFs.updateSlide(id, slideId, patch)
  })

  ipcMain.handle(IPC.STAGE_SLIDE_ADD, async (_, { id }: { id: string }) => {
    return await outlineFs.addSlide(id)
  })

  ipcMain.handle(IPC.STAGE_SLIDE_DELETE, async (_, { id, slideId }: { id: string; slideId: string }) => {
    return await outlineFs.deleteSlide(id, slideId)
  })

  ipcMain.handle(IPC.STAGE_SLIDE_REGENERATE, async (_, { id, slideId }: { id: string; slideId: string }) => {
    const { settings, outline } = await loadSettingsAndOutline(id)
    const target = outline.slides.find(s => s.id === slideId)
    if (!target) throw new Error('slide not found')
    const htmlPath = join(getProjectDir(id), 'index.html')
    let currentHtml = ''
    try { currentHtml = await readFile(htmlPath, 'utf8') } catch {}
    const cwd = getProjectDir(id)
    const others = outline.slides.filter(s => s.id !== slideId).map(s => ({ id: s.id, title: s.title }))
    const prompt = buildRegeneratePrompt(target, others, extractSection(currentHtml, slideId) ?? '')
    const key = `${id}:${slideId}`
    const runner = new GenerationRunner({
      cwd, topic: target.title, outline: prompt, settings, runId: id,
      systemPrompt: prompt,
      userMessage: '请根据以上指令重新生成该页。',
      onEvent: () => {},
      onProgress: (info) => broadcast(IPC.STAGE_SLIDE_REGENERATE_STREAM, {
        runId: key, projectId: id, slideId, kind: 'slide-regen', phase: 'streaming', chars: info.current,
      }),
      onDone: ({ html, durationMs }) => {
        const newSection = extractSection(html, slideId) ?? html.trim()
        const spliced = spliceSlide(currentHtml, slideId, newSection)
        projectFs.writeProjectHtml(id, spliced).then(() => {
          broadcast(IPC.HTML_SLIDE_UPDATED, { projectId: id, slideId, html: newSection })
        })
        broadcast(IPC.STAGE_SLIDE_REGENERATE_STREAM, {
          runId: key, projectId: id, slideId, kind: 'slide-regen', phase: 'done',
          chars: html.length, html: newSection, durationMs,
        })
        registry.unregister(key)
      },
      onError: ({ error }) => {
        const phase = registry.isCancelled(key) ? 'cancelled' : 'error'
        broadcast(IPC.STAGE_SLIDE_REGENERATE_STREAM, {
          runId: key, projectId: id, slideId, kind: 'slide-regen', phase, error,
        })
        registry.unregister(key)
        if (phase === 'error') throw new Error(error.message)
      },
    })
    registry.register(key, runner, 'slide-regen')
    await runner.run()
    if (registry.isCancelled(key)) {
      return { phase: 'cancelled' as const }
    }
    return { phase: 'done' as const, html: '', durationMs: 0 }
  })

  ipcMain.handle(IPC.STAGE_HTML_GENERATE, async (_, { id }: { id: string }) => {
    const { settings, outline, project } = await loadSettingsAndOutline(id)
    const style = await outlineFs.readStyle(id)
    const cwd = getProjectDir(id)
    let buffer = ''
    const runner = new GenerationRunner({
      cwd, topic: project.topic, outline: JSON.stringify({ outline, style }), settings, runId: id,
      onEvent: (m: any) => broadcast(IPC.SDK_EVENT, { runId: id, message: m }),
      onProgress: (info) => broadcast(IPC.GENERATION_PROGRESS, { runId: id, ...info }),
      onDone: async ({ html, durationMs }) => {
        buffer = html
        await projectFs.writeProjectHtml(id, buffer)
        await projectFs.setProjectStatus(id, 'generated')
        broadcast(IPC.GENERATION_DONE, { runId: id, html: buffer, durationMs })
      },
      onError: async ({ error }) => {
        await projectFs.setProjectStatus(id, 'failed', error.message)
        broadcast(IPC.GENERATION_ERROR, { runId: id, error })
      },
    })
    await runner.run()
    return { html: buffer, durationMs: 0 }
  })

  ipcMain.handle(IPC.STAGE_STYLE_SAVE, async (_, { id, style }: { id: string; style: StyleSettings }) => {
    await outlineFs.writeStyle(id, style)
  })

  ipcMain.handle(IPC.STAGE_OUTLINE_CANCEL, async (_, { id }: { id: string }) => {
    registry.markCancelled(id)
    const ok = registry.cancel(id)
    return { ok }
  })

  ipcMain.handle(IPC.STAGE_SLIDE_CANCEL, async (_, { id, slideId }: { id: string; slideId: string }) => {
    const key = `${id}:${slideId}`
    registry.markCancelled(key)
    const ok = registry.cancel(key)
    return { ok }
  })
}

function extractSection(html: string, slideId: string): string | null {
  const m = html.match(new RegExp(`<section[^>]*data-id=["']${slideId}["'][^>]*>[\\s\\S]*?</section>`, 'i'))
  return m ? m[0] : null
}
