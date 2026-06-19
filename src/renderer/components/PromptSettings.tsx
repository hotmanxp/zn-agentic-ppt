import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { PromptEditor } from './PromptEditor.js'

export interface PromptSpec {
  id: string
  title: string
  description: string
  defaultTemplate: string
  variables: Array<{ name: string; description: string; type: 'string' | 'json'; example?: string }>
}

export function PromptSettings() {
  const [specs, setSpecs] = useState<PromptSpec[] | null>(null)

  useEffect(() => {
    api.settings.prompts.listSpecs().then(setSpecs)
  }, [])

  return (
    <div>
      <h2 style={{ margin: '0 0 4px' }}>提示词</h2>
      <p style={{ color: '#6b7280', margin: '0 0 24px', fontSize: 14 }}>
        自定义每个 agent 提示词。可用 <code>{'{{name}}'}</code> 引用运行时变量。修改后可重置回默认。
      </p>
      {!specs && <div style={{ color: '#9ca3af' }}>加载中...</div>}
      {specs && specs.map(spec => (
        <PromptEditor key={spec.id} spec={spec} />
      ))}
    </div>
  )
}