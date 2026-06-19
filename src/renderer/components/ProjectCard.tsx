import { Card, Tag } from 'antd'
import { useNavigate } from 'react-router-dom'
import type { ProjectMeta } from '@shared/types'
import { api } from '../lib/api'

const STATUS_COLORS = { draft: 'gold', generated: 'green', failed: 'red' } as const
const STATUS_LABELS = { draft: '草稿', generated: '已生成', failed: '失败' } as const
const EMOJIS = ['📊', '📈', '🚀', '💡', '🎯', '📋', '🌟', '🔧']

export function ProjectCard({ project }: { project: ProjectMeta }) {
  const nav = useNavigate()
  const emoji = EMOJIS[project.id.charCodeAt(0) % EMOJIS.length]
  return (
    <Card hoverable onClick={() => nav(`/projects/${project.id}`)}
          actions={[
            <a key="del" onClick={async (e) => {
              e.stopPropagation()
              if (confirm(`删除项目 "${project.title}"？`)) {
                await api.project.delete(project.id)
                window.location.reload()
              }
            }}>删除</a>,
          ]}>
      <div style={{ height: 100, background: `linear-gradient(135deg, #dbeafe, #bfdbfe)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, borderRadius: 6, marginBottom: 12 }}>{emoji}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 4 }}>
        <strong>{project.title}</strong>
        <Tag color={STATUS_COLORS[project.status]}>{STATUS_LABELS[project.status]}</Tag>
      </div>
      <small style={{ color: '#9ca3af' }}>{project.pageCount ?? '—'} 页 · {new Date(project.updatedAt).toLocaleString('zh-CN')}</small>
    </Card>
  )
}
