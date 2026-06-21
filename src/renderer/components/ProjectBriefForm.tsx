import { useEffect, useState } from 'react'
import { Button, Input, Tag } from 'antd'
import type { ProjectBrief } from '@shared/types'

const { TextArea } = Input

export interface ProjectBriefFormProps {
  value: ProjectBrief | null
  onChange: (b: ProjectBrief) => void
  badge: 'empty' | 'optimized' | 'edited'
  optimizing?: boolean
  onOptimize?: () => void
}

export function ProjectBriefForm({ value, onChange, badge, optimizing, onOptimize }: ProjectBriefFormProps) {
  const [markdown, setMarkdown] = useState<string>(value?.markdown ?? '')

  useEffect(() => {
    setMarkdown(value?.markdown ?? '')
  }, [value?.markdown])

  const update = (md: string) => {
    setMarkdown(md)
    onChange({ markdown: md })
  }

  const badgeText =
    badge === 'optimized' ? '✓ 已优化' : badge === 'edited' ? '已编辑' : '待优化'
  const badgeColor = badge === 'optimized' ? 'green' : badge === 'edited' ? 'orange' : 'default'

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong>项目信息(markdown 文本)</strong>
          <Tag color={badgeColor}>{badgeText}</Tag>
        </div>
        {onOptimize && (
          <Button type="primary" size="small" onClick={onOptimize} loading={optimizing} disabled={optimizing}>
            ✨ 优化
          </Button>
        )}
      </div>
      <TextArea
        rows={14}
        value={markdown}
        onChange={e => update(e.target.value)}
        placeholder={`# PPT 名称\n\n## 演讲对象和场景\n...\n\n## 演讲时长(分钟)\n30\n\n## 演讲内容\n- 要点 1\n- 要点 2\n\n## 整体风格\n...`}
        style={{ fontFamily: 'SF Mono, Monaco, monospace', fontSize: 13, lineHeight: 1.6 }}
      />
      <small style={{ color: '#9ca3af' }}>
        字符数:{markdown.length} · AI 优化结果直接回填到这里,可手动编辑。下一步大纲生成会读取此文本。
      </small>
    </div>
  )
}