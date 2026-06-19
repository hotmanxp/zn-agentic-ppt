// Run the actual GenerationRunner with the same options the outline handler uses,
// print the buffer that gets passed to onDone.
import { GenerationRunner } from '../src/main/sdk/runner.js'

const apiKey = 'sk-cp-3CTQoclrT2UA0CZ8x-fpZSdl4wXqzL6F_1y5C3ZaUNWc-4bR7ne6qqlupv9v7bRfEP2ZsBvpdKQHRkJBa9ueENjYpk2Hq8ZRriM1e9bPMY4Avp3Fhwzf6Es'
const settings = {
  llm: {
    baseUrl: 'https://api.minimaxi.com/anthropic',
    apiKey,
    model: 'MiniMax-M3',
  },
  ui: { theme: 'light' },
  paths: { projectsDir: '/tmp' },
} as any

const topic = 'E2E streaming test'
const source = 'Test content for streaming progress. '.repeat(20)
const systemPrompt = `你是 PPT 大纲编辑。用户会给你原始内容（文章、笔记、要点）。
请把它结构化成 4-8 张幻灯片的大纲，每页包含：
- title: 标题（≤20 字）
- bullets: 要点数组（2-5 项，每项 ≤30 字）

输出 JSON 格式：{ "slides": [...] }。不要解释，直接输出。

用户主题：${topic}

用户原始内容：
${source}`

let onDoneBuffer = ''
let onErrorPayload: any = null
let progressCount = 0
const runner = new GenerationRunner({
  cwd: process.cwd(),
  topic,
  outline: source,
  settings,
  runId: 'probe',
  systemPrompt,
  userMessage: '请根据以上指令生成大纲。',
  onEvent: () => {},
  onProgress: () => { progressCount++ },
  onDone: ({ html }) => { onDoneBuffer = html },
  onError: ({ error }) => { onErrorPayload = error },
})

await runner.run()

console.log('--- Runner result ---')
console.log(`onError: ${JSON.stringify(onErrorPayload)}`)
console.log(`onDone buffer length: ${onDoneBuffer.length}`)
console.log(`onDone buffer (first 500 chars):`)
console.log(onDoneBuffer.slice(0, 500))
console.log('---')
console.log(`progress callbacks: ${progressCount}`)
console.log(`runner.html: ${runner.html?.length ?? 'null'}`)
