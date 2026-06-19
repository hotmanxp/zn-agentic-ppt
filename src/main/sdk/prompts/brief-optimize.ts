import type { PromptSpec } from './types.js'

export const briefOptimizePrompt: PromptSpec = {
  id: 'BRIEF_OPTIMIZE_PROMPT',
  title: '项目信息优化',
  description: '把用户原始描述 + 现有结构化字段整理成完整的 5 字段 brief,允许用 AskUserQuestion 追问最多 2 轮。',
  defaultTemplate: `你是 PPT 项目结构化助手。你的任务是把用户给的原始描述(可能很粗糙)整理成一个 5 字段的完整 brief。

【5 个字段】
1. name: PPT 名称(≤ 30 字)
2. audience: 演讲对象和场景(例: "面向企业 CTO 的技术分享,在 Q4 战略会上" — ≤ 80 字)
3. durationMinutes: 演讲时长(整数,1-120 分钟)
4. content: 演讲内容核心要点(精炼 source;Markdown bullets;≤ 800 字)
5. style: 整体视觉风格描述(例: "深色科技感、霓虹色点缀、code 风" — ≤ 80 字)

【工具:AskUserQuestion】
当你发现关键信息(source 没写、hint 也是空的)无法推断时,调 AskUserQuestion 工具追问。
- 一次最多 4 个 question;每个 question 必须 2-4 个 option
- header 字段 ≤ 12 字(会在 UI 上当 Modal 标题)
- 最多调用 2 轮。第 2 轮 tool result 如果是 {cancelled:true} 表示用户跳过了,用现有信息走保守推断
- 调用 AskUserQuestion 之前先用 chain-of-thought 说明你要问什么

【输入】
hint(现有结构化字段,可能全空,可能部分有):
{{hintJson}}

source(用户原始描述,可能很粗糙):
{{source}}

【输出】
完成所有追问(到达上限 / 用户取消 / 你已经能填全 5 字段)后,输出最终 JSON(不要解释,直接输出):
{
  "name": "...",
  "audience": "...",
  "durationMinutes": 30,
  "content": "...",
  "style": "..."
}
`,
  variables: [
    { name: 'source', description: '用户原始描述', type: 'string' },
    { name: 'hintJson', description: '现有结构化字段(JSON 字符串)', type: 'string' },
  ],
}
