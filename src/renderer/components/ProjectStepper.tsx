import { Link, useLocation } from 'react-router-dom'
import { useLoadProjectDetail } from '../hooks/useLoadProjectDetail.js'

const STAGES = [
  { key: 'collect', label: '内容收集', path: 'collect' },
  { key: 'outline', label: '生成大纲', path: 'outline' },
  { key: 'generate', label: '生成预览', path: 'generate' },
  { key: 'fine-tune', label: '细节微调', path: 'fine-tune' },
] as const

export function ProjectStepper({ projectId }: { projectId: string }) {
  useLoadProjectDetail()
  const loc = useLocation()
  const current = loc.pathname.split('/').pop() ?? ''
  const currentIdx = STAGES.findIndex(s => s.path === current)

  return (
    <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '20px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', maxWidth: 900, margin: '0 auto' }}>
        {STAGES.map((s, i) => {
          const done = i < currentIdx
          const active = i === currentIdx
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < STAGES.length - 1 ? '1' : '0' }}>
              <Link to={`/projects/${projectId}/${s.path}`} style={{
                display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
                color: active ? '#FF6600' : done ? '#16a34a' : '#9ca3af',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: active ? '#FF6600' : done ? '#16a34a' : '#e5e7eb',
                  color: active || done ? '#fff' : '#9ca3af',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600,
                }}>{i + 1}</div>
                <span style={{ fontWeight: active ? 500 : 400, fontSize: 14 }}>{s.label}</span>
              </Link>
              {i < STAGES.length - 1 && (
                <div style={{ flex: 1, height: 2, background: i < currentIdx ? '#16a34a' : '#e5e7eb', margin: '0 12px' }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
