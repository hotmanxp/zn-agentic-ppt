import { useState } from 'react'
import { PromptEditor } from './PromptEditor.js'

export type PromptVarType = 'string' | 'json'

export interface PromptVar {
  name: string
  description: string
  type: PromptVarType
  example?: string
}

export interface PromptSpec {
  id: 'outline' | 'regenerate' | 'slide-system' | 'slide-user'
  title: string
  description: string
  defaultTemplate: string
  variables: PromptVar[]
}

export function PromptSettings() {
  const [, setReload] = useState(0)

  return (
    <div>
      <h2 style={{ margin: '0 0 4px' }}>提示词</h2>
      <p style={{ color: '#6b7280', margin: '0 0 24px', fontSize: 14 }}>
        自定义每个 agent 提示词。可用 <code>{'{{name}}'}</code> 引用运行时变量。修改后可重置回默认。
      </p>
      {PROMPT_METADATA.map(spec => (
        <PromptEditor key={spec.id} spec={spec} onChange={() => setReload(r => r + 1)} />
      ))}
    </div>
  )
}

// Static metadata mirror of main-process PROMPT_SPECS.
// Kept in sync by hand; if drift is a concern, expose list via IPC.
const PROMPT_METADATA: PromptSpec[] = [
  {
    id: 'outline', title: '大纲生成',
    description: '把用户原始内容整理成 4-8 张幻灯片大纲。',
    defaultTemplate: '',
    variables: [
      { name: 'topic', description: '用户主题', type: 'string' },
      { name: 'source', description: '原始内容', type: 'string' },
    ],
  },
  {
    id: 'regenerate', title: '单页重新生成',
    description: '重新生成单页 HTML（layout 对齐轮换）。',
    defaultTemplate: '',
    variables: [
      { name: 'target', description: '目标页 outline', type: 'json' },
      { name: 'others', description: '其他页标题数组', type: 'json' },
      { name: 'currentSectionHtml', description: '当前页 HTML', type: 'string' },
      { name: 'layout', description: 'layout 编号', type: 'string' },
      { name: 'slideId', description: '幻灯片 id', type: 'string' },
      { name: 'layoutHint', description: 'layout 提示文本', type: 'string' },
    ],
  },
  {
    id: 'slide-system', title: '单页系统提示词',
    description: 'Persona + 硬性规则 + 全局视觉风格。',
    defaultTemplate: '',
    variables: [
      { name: 'globalStyle.primaryColor', description: '主色', type: 'string' },
      { name: 'globalStyle.accentColor', description: '强调色', type: 'string' },
      { name: 'globalStyle.fontFamily', description: '字体', type: 'string' },
      { name: 'globalStyle.aspectRatio', description: '尺寸比', type: 'string' },
    ],
  },
  {
    id: 'slide-user', title: '单页用户提示词',
    description: '每张幻灯片的 per-turn 请求。',
    defaultTemplate: '',
    variables: [
      { name: 'cwd', description: '项目目录', type: 'string' },
      { name: 'slideIndex', description: '当前幻灯片位置', type: 'string' },
      { name: 'totalSlides', description: '幻灯片总数', type: 'string' },
      { name: 'slideId', description: '幻灯片 id', type: 'string' },
      { name: 'layout', description: 'layout 编号', type: 'string' },
      { name: 'target.title', description: '当前页标题', type: 'string' },
      { name: 'targetBullets', description: '当前页要点', type: 'string' },
      { name: 'targetNotes', description: '当前页备注', type: 'string' },
      { name: 'othersTitles', description: '其他页标题', type: 'string' },
      { name: 'styleBlock', description: '全局样式参数块', type: 'string' },
      { name: 'layoutDirection', description: 'layout 视觉方向', type: 'string' },
    ],
  },
]
