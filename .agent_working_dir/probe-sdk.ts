// Probe the vendor SDK to see what events it actually yields.
// @ts-ignore vendor bundle — no types available
import { query as sdkQuery } from '../vendor/sdk.mjs'

const apiKey = 'sk-cp-3CTQoclrT2UA0CZ8x-fpZSdl4wXqzL6F_1y5C3ZaUNWc-4bR7ne6qqlupv9v7bRfEP2ZsBvpdKQHRkJBa9ueENjYpk2Hq8ZRriM1e9bPMY4Avp3Fhwzf6Es'
const model = 'MiniMax-M3'
const cwd = process.cwd()
const systemPrompt = `你是 PPT 大纲编辑。用户会给你原始内容（文章、笔记、要点）。
请把它结构化成 4-8 张幻灯片的大纲，每页包含：
- title: 标题（≤20 字）
- bullets: 要点数组（2-5 项，每项 ≤30 字）

输出 JSON 格式：{ "slides": [...] }。不要解释，直接输出。

用户主题：E2E streaming test

用户原始内容：
Test content for streaming progress. Test content for streaming progress. Test content for streaming progress. Test content for streaming progress.`

console.log('--- Calling vendor SDK ---')
const q = sdkQuery({
  prompt: '请根据以上指令生成大纲。',
  options: {
    cwd,
    model,
    systemPrompt,
    env: {
      ANTHROPIC_BASE_URL: 'https://api.minimaxi.com/anthropic',
      ANTHROPIC_AUTH_TOKEN: apiKey,
    },
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    canUseTool: async () => ({ behavior: 'deny', message: 'tools disabled' }),
    maxTurns: 1,
  },
})

let textAccumulated = ''
let eventCount = 0
const eventTypes: Record<string, number> = {}
try {
  for await (const msg of q) {
    eventCount++
    const t = (msg as any).type ?? 'unknown'
    eventTypes[t] = (eventTypes[t] ?? 0) + 1

    if (t === 'assistant') {
      const content = (msg as any).message?.content ?? []
      for (const block of content) {
        if (block.type === 'text') {
          textAccumulated += block.text
        }
        if (block.type === 'thinking') {
          console.log(`  thinking block (${(block.thinking ?? '').length} chars): ${(block.thinking ?? '').slice(0, 200)}`)
        }
      }
    }
    if (t === 'result') {
      console.log(`  result subtype: ${(msg as any).subtype}, duration: ${(msg as any).duration_ms}`)
    }
    if (t === 'system') {
      console.log(`  system subtype: ${(msg as any).subtype}`)
    }
  }
  console.log('--- Done ---')
  console.log(`Total events: ${eventCount}`)
  console.log(`Event types: ${JSON.stringify(eventTypes)}`)
  console.log(`Text accumulated: ${textAccumulated.length} chars`)
  console.log(`Text (first 800 chars):`)
  console.log(textAccumulated.slice(0, 800))
} catch (e: any) {
  console.log('--- Error ---')
  console.log(e?.message ?? String(e))
}
