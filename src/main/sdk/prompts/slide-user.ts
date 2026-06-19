import type { PromptSpec } from './types.js'

const LAYOUT_DIRECTIONS = [
  `深色 hero 封面：深蓝/黑色背景 (#0b1020 / #1e3a8a)，可加暖橙/粉色 radial 光斑装饰；大粗体白字标题，居中；上方可加 "CHAPTER" 大写小标签；下方加分隔线和副标题`,
  `暖橙卡片网格：暖白/橙色渐变背景 (#fff7ed / #fed7aa)，深棕色 (#7c2d12) 文字；要点用白色卡片 + 橙色顶边 + 橙色圆形编号；标题前可加 "01 / " 前缀`,
  `左右双色对峙：深色背景 (#0f172a)，左右两个分栏，左暖红 (#7c2d12) / 右冷蓝 (#1e3a8a) 渐变面板；标题居中置顶；左列标 ▶，右列标 ◆；要点用细分隔线`,
  `暗色霓虹大数字：纯黑背景 (#020617)，标题小写大写+灰白色；要点用 SF Mono 等宽数字 80-100px，颜色循环：绿 (#10b981) / 橙 (#f59e0b) / 红 (#ef4444)，每条要点用对应颜色的顶部色条`,
  `米色衬线引言：米色背景 (#fef3c7)，Georgia 衬线斜体大字，深棕色 (#451a03)；上下加装饰大引号；下方署名 "— 作者" 用细字间距`,
] as const

export const slideUserPrompt: PromptSpec = {
  id: 'SLIDE_USER_PROMPT',
  title: '单页用户提示词',
  description: '每张幻灯片的 per-turn 请求：项目元数据 + 本张内容 + layout 视觉方向。',
  defaultTemplate: `请为第 {{slideIndex}} 张 PPT（layout-{{layout}}）生成 HTML 内容并写入 slides/{{slideId}}.html。

【项目信息】
CWD: {{cwd}}
共 {{totalSlides}} 张幻灯片, 当前要生成第 {{slideIndex}} 张

【文件结构】
- {{cwd}}/index.html — 框架(自动生成,不要改)
- {{cwd}}/slides/<id>.html — 每张幻灯片(你编辑这个)

【其他页标题】（保持整体连贯）
{{othersTitles}}

【本张内容】
标题: {{target.title}}
要点:
{{targetBullets}}
{{targetNotes}}

{{styleBlock}}
【layout-{{layout}} 视觉方向 — 这一页必须体现这种风格】
{{layoutDirection}}

【操作步骤】
1. 用 Read 工具读 slides/{{slideId}}.html（已存在空模板）
2. 用 Write 工具覆盖整个文件为新的 <section> HTML，**按上面 layout-{{layout}} 的视觉方向加 inline style + 装饰元素**
3. 完成后回复 "done"`,
  variables: [
    { name: 'cwd', description: '项目目录绝对路径', type: 'string' },
    { name: 'slideIndex', description: '当前幻灯片在整组中的位置（1-based）', type: 'string' },
    { name: 'totalSlides', description: '幻灯片总数', type: 'string' },
    { name: 'slideId', description: '当前幻灯片 id', type: 'string' },
    { name: 'layout', description: '当前 layout 编号 (1-5)', type: 'string', example: '2' },
    { name: 'target.title', description: '当前页标题', type: 'string' },
    { name: 'targetBullets', description: '当前页要点（预渲染为编号列表）', type: 'string' },
    { name: 'targetNotes', description: '当前页备注（可选，可能为空）', type: 'string' },
    { name: 'othersTitles', description: '其他页标题（预渲染为 bullet 列表）', type: 'string' },
    { name: 'styleBlock', description: '全局样式参数块（可选，可能为空）', type: 'string' },
    { name: 'layoutDirection', description: '当前 layout 的视觉方向描述（由调用方根据 layout 编号选）', type: 'string' },
  ],
}

export { LAYOUT_DIRECTIONS }
