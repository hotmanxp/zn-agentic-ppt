import type { OutlineSlide } from '@shared/types'

export function SlideList({
  slides, currentId, onSelect,
}: {
  slides: OutlineSlide[]
  currentId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div style={{ background: '#fff', borderRight: '1px solid #e5e7eb', overflow: 'auto', padding: 8 }}>
      <div style={{ padding: '8px 12px', fontSize: 12, color: '#6b7280', fontWeight: 500 }}>
        幻灯片 ({slides.length})
      </div>
      {slides.map((s, i) => {
        const active = s.id === currentId
        return (
          <div key={s.id} onClick={() => onSelect(s.id)} style={{
            padding: '10px 12px', marginBottom: 4, borderRadius: 4, cursor: 'pointer',
            background: active ? '#eff6ff' : 'transparent',
            borderLeft: active ? '3px solid #FF6600' : '3px solid transparent',
          }}>
            <div style={{ fontSize: 12, color: active ? '#FF6600' : '#6b7280', fontWeight: 500 }}>
              第 {i + 1} 页
            </div>
            <div style={{ fontSize: 13, fontWeight: active ? 500 : 400 }}>{s.title}</div>
          </div>
        )
      })}
    </div>
  )
}
