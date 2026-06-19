import { useEffect, useState } from 'react'
import { Input, InputNumber, Tag } from 'antd'
import type { ProjectBrief } from '@shared/types'

const { TextArea } = Input

const EMPTY_BRIEF: ProjectBrief = {
  name: '',
  audience: '',
  durationMinutes: 30,
  pageCountEst: 20,
  content: '',
  style: '',
}

export interface ProjectBriefFormProps {
  value: ProjectBrief | null
  onChange: (b: ProjectBrief) => void
  badge: 'empty' | 'optimized' | 'edited'
}

export function ProjectBriefForm({ value, onChange, badge }: ProjectBriefFormProps) {
  const [local, setLocal] = useState<ProjectBrief>(value ?? EMPTY_BRIEF)

  useEffect(() => {
    setLocal(value ?? EMPTY_BRIEF)
  }, [value])

  const update = (patch: Partial<ProjectBrief>) => {
    const next = { ...local, ...patch }
    if (patch.durationMinutes !== undefined) {
      next.pageCountEst = Math.max(3, Math.min(60, Math.round(patch.durationMinutes / 1.5)))
    }
    setLocal(next)
    onChange(next)
  }

  const badgeText =
    badge === 'optimized' ? '✓ 已优化' : badge === 'edited' ? '已编辑' : '点击右侧"优化"生成'
  const badgeColor = badge === 'optimized' ? 'green' : badge === 'edited' ? 'orange' : 'default'

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong>项目信息(结构化)</strong>
        <Tag color={badgeColor}>{badgeText}</Tag>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label>PPT 名称(≤ 30)</label>
        <Input maxLength={30} value={local.name} onChange={e => update({ name: e.target.value })} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label>演讲对象和场景(≤ 80)</label>
        <TextArea
          rows={2}
          maxLength={80}
          showCount
          value={local.audience}
          onChange={e => update({ audience: e.target.value })}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label>演讲时长(分钟)</label>
        <InputNumber
          min={1}
          max={120}
          value={local.durationMinutes}
          onChange={v => v !== null && update({ durationMinutes: v as number })}
        />
        <small style={{ marginLeft: 8, color: '#6b7280' }}>≈ {local.pageCountEst} 页</small>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label>演讲内容(≤ 800)</label>
        <TextArea
          rows={6}
          maxLength={800}
          showCount
          value={local.content}
          onChange={e => update({ content: e.target.value })}
          style={{ fontFamily: 'SF Mono, Monaco, monospace', fontSize: 13 }}
        />
      </div>
      <div>
        <label>整体风格(≤ 80)</label>
        <Input maxLength={80} value={local.style} onChange={e => update({ style: e.target.value })} />
      </div>
    </div>
  )
}