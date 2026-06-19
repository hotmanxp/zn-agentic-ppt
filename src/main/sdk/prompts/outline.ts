import type { PromptSpec } from './types.js'

export const outlinePrompt: PromptSpec = {
  id: 'OUTLINE_PROMPT',
  title: '大纲生成',
  description: '基于项目 brief 整理成 4-8 张幻灯片大纲,含 cover/closing 强制首尾与全局风格。',
  defaultTemplate: `你是 PPT 大纲编辑 + 视觉策划。基于以下项目 brief 整理成 4-8 张幻灯片大纲,每页包含:
- title: 标题(≤ 20 字)
- bullets: 要点数组(2-5 项,每项 ≤ 30 字)
- notes: 可选,补充说明(≤ 50 字)
- layout: 该页建议的视觉布局(cover / list / columns / stats / quote / closing 之一)

【项目 brief】
名称: {{briefName}}
演讲对象和场景: {{briefAudience}}
演讲时长(分钟): {{briefDurationMinutes}}
演讲内容:
{{briefContent}}
整体风格: {{briefStyle}}

【全局风格】(整套 PPT 保持视觉一致 — 每张幻灯片都会遵循)
- 主色 #1677ff(蓝)
- 强调色 #722ed1(紫)
- 暖色装饰 #f59e0b(橙,仅 cover/closing 用)
- 字体 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif
- 尺寸 16:9
- 一张幻灯片只用一种 layout,不要混

【布局类型说明】(每张选一种,相邻页不要用同一种)
- cover: 封面页,大标题 + 副标题,仅 1 张(必须放在第 1 张)
- list: 卡片列表,4-6 条要点
- columns: 左右分栏,对比/并列/正反
- stats: 大数字 / KPI(适合百分比/数据/效果)
- quote: 居中引言 / 金句(10 张里最多用 1-2 次)
- closing: 结尾页(致谢 / Q&A / 总结),仅 1 张(必须放在最后 1 张)

【结构硬性要求】
- 第 1 张必须是 cover
- 最后 1 张必须是 closing
- 中间 N-2 张循环使用 list / columns / stats / quote,避免连续 2 张同一种
- N = 4 ~ 8 张

输出 JSON 格式(不要解释,直接输出):
{
  "globalStyle": {
    "primaryColor": "#1677ff",
    "accentColor": "#722ed1",
    "fontFamily": "-apple-system, \\"PingFang SC\\", \\"Microsoft YaHei\\", sans-serif",
    "aspectRatio": "16/9"
  },
  "slides": [
    { "title": "...", "bullets": [...], "layout": "cover" },
    { "title": "...", "bullets": [...], "layout": "list" },
    ...,
    { "title": "...", "bullets": [...], "layout": "closing" }
  ]
}
`,
  variables: [
    { name: 'briefName', description: 'PPT 名称', type: 'string', example: 'AI 在教育中的应用' },
    { name: 'briefAudience', description: '演讲对象和场景', type: 'string' },
    { name: 'briefDurationMinutes', description: '演讲时长(分钟)', type: 'string' },
    { name: 'briefContent', description: '演讲内容要点', type: 'string' },
    { name: 'briefStyle', description: '整体风格', type: 'string' },
  ],
}
