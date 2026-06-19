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
    let buffer = ''
    const runner = new GenerationRunner({
      cwd, topic: project.topic, outline: source, settings, runId: id,
      systemPrompt: buildOutlinePrompt(project.topic, source),
      userMessage: '请根据以上指令生成大纲。',
      onEvent: (m: any) => broadcast(IPC.STAGE_OUTLINE_STREAM, { id, message: m }),
      onProgress: () => {},
      onDone: ({ html }) => { buffer = html },
      onError: ({ error }) => { throw new Error(error.message) },
    })
    await runner.run()
    // Parse JSON from buffer (may have markdown fences)
    const jsonMatch = buffer.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('LLM did not return JSON')
    const parsed = JSON.parse(jsonMatch[0]) as { slides: OutlineSlide[] }
    await outlineFs.writeOutline(id, { slides: parsed.slides, generatedAt: Date.now() })
    return { slides: parsed.slides }
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
    const style = await outlineFs.readStyle(id)
    const cwd = getProjectDir(id)
    const others = outline.slides.filter(s => s.id !== slideId).map(s => ({ id: s.id, title: s.title }))
    const prompt = buildRegeneratePrompt(target, others, extractSection(currentHtml, slideId) ?? '')
    let buffer = ''
    const runner = new GenerationRunner({
      cwd, topic: target.title, outline: prompt, settings, runId: id,
      systemPrompt: prompt,
      userMessage: '请根据以上指令重新生成该页。',
      onEvent: () => {}, onProgress: () => {},
      onDone: ({ html, durationMs }) => {
        buffer = html
        // Splice into existing HTML
        const newSection = extractSection(buffer, slideId) ?? buffer.trim()
        const spliced = spliceSlide(currentHtml, slideId, newSection)
        projectFs.writeProjectHtml(id, spliced).then(() => {
          broadcast(IPC.HTML_SLIDE_UPDATED, { projectId: id, slideId, html: newSection })
        })
      },
      onError: ({ error }) => { throw new Error(error.message) },
    })
    await runner.run()
    return { html: buffer, durationMs: 0 }
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
}

function extractSection(html: string, slideId: string): string | null {
  const m = html.match(new RegExp(`<section[^>]*data-id=["']${slideId}["'][^>]*>[\\s\\S]*?</section>`, 'i'))
  return m ? m[0] : null
}
