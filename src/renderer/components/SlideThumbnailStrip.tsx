import type { PptSlide } from '../stores/pptGeneration.js'

const STATUS_COLOR: Record<string, string> = {
  pending: '#d1d5db',
  layout: '#94a3b8',
  generating: '#fbbf24',
  done: '#22c55e',
  failed: '#ef4444',
}

const STATUS_LABEL: Record<string, string> = {
  pending: '未开始',
  layout: '布局',
  generating: '生成中…',
  done: '已完成',
  failed: '失败',
}

export interface SlideThumbnailStripProps {
  slides: PptSlide[]
  currentId: string | null
  onSelect: (slideId: string) => void
}

export function SlideThumbnailStrip({ slides, currentId, onSelect }: SlideThumbnailStripProps) {
  return (
    <div style={{
      width: 240, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
      background: '#f9fafb', borderRight: '1px solid #e5e7eb', padding: 12,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {slides.map((s, i) => {
          const color = STATUS_COLOR[s.status] ?? STATUS_COLOR.pending
          const label = STATUS_LABEL[s.status] ?? s.status
          const isCurrent = s.id === currentId
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{
                width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: 10, borderRadius: 6,
                border: isCurrent ? '2px solid #FF6600' : '1px solid #e5e7eb',
                background: isCurrent ? '#eff6ff' : '#fff',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <div style={{
                width: 28, height: 18, flexShrink: 0, borderRadius: 3,
                background: color, color: '#fff', fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, color: '#111827', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>{label}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
