// Quick probe: call the same LLM the app uses, with the same prompt,
// and print the raw response. Bypasses the vendor SDK entirely so we
// can see exactly what the model returns.
import Anthropic from '@anthropic-ai/sdk'

const baseUrl = 'https://api.minimaxi.com/anthropic'
const apiKey = 'sk-cp-3CTQoclrT2UA0CZ8x-fpZSdl4wXqzL6F_1y5C3ZaUNWc-4bR7ne6qqlupv9v7bRfEP2ZsBvpdKQHRkJBa9ueENjYpk2Hq8ZRriM1e9bPMY4Avp3Fhwzf6Es'
const model = 'MiniMax-M3'

const topic = 'E2E streaming test'
const source = 'Test content for streaming progress. '.repeat(20)

const systemPrompt = `你是 PPT 大纲编辑。用户会给你原始内容（文章、笔记、要点）。
请把它结构化成 4-8 张幻灯片的大纲，每页包含：
- title: 标题（≤20 字）
- bullets: 要点数组（2-5 项，每项 ≤30 字）
- notes: 可选，补充说明（≤50 字）

输出 JSON 格式：{ "slides": [...] }。不要解释，直接输出。

用户主题：${topic}

用户原始内容：
${source}`

const client = new Anthropic({ apiKey, baseURL: baseUrl })

console.log('--- Sending request ---')
console.log(`model: ${model}`)
console.log(`baseUrl: ${baseUrl}`)
console.log(`systemPrompt length: ${systemPrompt.length}`)
console.log('userMessage: 请根据以上指令生成大纲。')

try {
  const msg = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      { role: 'user', content: '请根据以上指令生成大纲。' },
    ],
  })
  console.log('--- Response ---')
  console.log(`stop_reason: ${msg.stop_reason}`)
  console.log(`usage: ${JSON.stringify(msg.usage)}`)
  console.log('content blocks:')
  for (const block of msg.content) {
    console.log(`  type: ${block.type}`)
    if (block.type === 'text') {
      console.log(`  text length: ${block.text.length}`)
      console.log(`  text (first 2000 chars):`)
      console.log(block.text.slice(0, 2000))
    }
  }
} catch (e: any) {
  console.log('--- Error ---')
  console.log(e?.message ?? String(e))
  if (e?.status) console.log(`status: ${e.status}`)
  if (e?.error) console.log(`error: ${JSON.stringify(e.error)}`)
}
