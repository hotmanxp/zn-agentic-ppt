#!/usr/bin/env bun
// Real end-to-end generation test using the vendored SDK + app's fs layer
// Creates a project, fills outline, runs generation, writes HTML

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
// @ts-ignore vendor SDK
import { query as sdkQuery } from './vendor/sdk.mjs'

const DATA_ROOT = join(homedir(), '.zn-agentic-ppt')
const PROJECTS_DIR = join(DATA_ROOT, 'projects')

const projectId = randomUUID()
const topic = '2026 产品路线图'
const outline = `# 2026 产品路线图

## 季度概览
- Q1 重点：核心架构升级
- Q2 重点：多端支持
- Q3 重点：AI 能力集成
- Q4 重点：商业化

## 关键里程碑
- 3 月：v2.0 灰度发布
- 6 月：SDK 1.0 上线
- 9 月：插件市场开放

## 团队与资源
- 前端 6 人 / 后端 8 人
- 预算 ¥2.4M`

// Load settings
const settings = JSON.parse(await readFile(join(DATA_ROOT, 'settings.json'), 'utf8'))
console.log(`[t+0ms] Settings loaded. Model: ${settings.llm.model}, baseUrl: ${settings.llm.baseUrl}`)

const projectDir = join(PROJECTS_DIR, projectId)
await mkdir(projectDir, { recursive: true })
const now = Date.now()
const meta = {
  id: projectId,
  title: topic,
  topic,
  status: 'draft',
  outline,
  pageCount: null,
  createdAt: now,
  updatedAt: now,
}
await writeFile(join(projectDir, 'meta.json'), JSON.stringify(meta, null, 2))
await writeFile(join(projectDir, 'outline.md'), outline)
console.log(`[t+${Date.now() - now}ms] Project created: ${projectId}`)

const systemPrompt = `你是 zn-agentic-ppt 应用的演示文稿生成助手。根据用户的"主题 + 大纲"生成一份完整、可独立播放的 HTML PPT。

输出要求：
- 输出**完整 HTML 文档**（<!DOCTYPE html> ... </html>），不是片段
- 16:9 比例 (aspect-ratio: 16/9)
- 内嵌 CSS（不依赖外部资源，offline 友好）
- 主题风格：现代简约，主色 #1677ff，强调 #722ed1
- 每张幻灯片结构：
    <section class="slide">
      <h1>{标题}</h1>
      <div class="content">{要点}</div>
    </section>
- 幻灯片之间用 page-break 分割
- 不写注释、不写解释、不写元描述，直接输出 HTML

用户主题：${topic}

用户大纲（Markdown）：
${outline}`

const start = Date.now()
const q = sdkQuery({
  prompt: 'Generate the PPT now.',
  options: {
    cwd: projectDir,
    model: settings.llm.model,
    systemPrompt,
    env: {
      ANTHROPIC_BASE_URL: settings.llm.baseUrl,
      ANTHROPIC_AUTH_TOKEN: settings.llm.apiKey,
    },
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    canUseTool: async () => ({ behavior: 'deny', message: 'no tools' }),
    maxTurns: 1,
  },
})

let buffer = ''
let lastProgress = 0
const progressInterval = setInterval(() => {
  if (buffer.length > lastProgress) {
    process.stdout.write(`\r[t+${((Date.now() - start) / 1000).toFixed(1)}s] Streaming: ${buffer.length} chars`)
    lastProgress = buffer.length
  }
}, 200)

let result
for await (const msg of q) {
  if (msg.type === 'system' && msg.subtype === 'init') {
    console.log(`\n[t+${((Date.now() - start) / 1000).toFixed(1)}s] System init. Models: ${msg.models?.length ?? 0}`)
  }
  if (msg.type === 'assistant') {
    for (const block of msg.message?.content ?? []) {
      if (block.type === 'text') buffer += block.text
    }
  }
  if (msg.type === 'result') {
    result = msg
  }
}
clearInterval(progressInterval)
q.close()

const elapsed = ((Date.now() - start) / 1000).toFixed(1)
console.log(`\n[t+${elapsed}s] Done. Result: ${result?.subtype}, is_error=${result?.is_error}, duration=${result?.duration_ms}ms`)
console.log(`[t+${elapsed}s] HTML length: ${buffer.length} chars`)

if (result?.subtype === 'success' && buffer.length > 100) {
  await writeFile(join(projectDir, 'index.html'), buffer)
  meta.status = 'generated'
  meta.htmlSize = buffer.length
  meta.updatedAt = Date.now()
  await writeFile(join(projectDir, 'meta.json'), JSON.stringify(meta, null, 2))
  console.log(`[t+${elapsed}s] HTML written to ${projectDir}/index.html`)
  console.log(`[t+${elapsed}s] First 300 chars: ${buffer.slice(0, 300).replace(/\n/g, ' ')}`)
} else {
  console.log(`[t+${elapsed}s] FAILED. result:`, JSON.stringify(result, null, 2).slice(0, 500))
  console.log(`[t+${elapsed}s] buffer (first 300): ${buffer.slice(0, 300)}`)
}
