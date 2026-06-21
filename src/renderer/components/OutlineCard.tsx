import { Input, Button } from 'antd'
import type { OutlineSlide } from '@shared/types'

const { TextArea } = Input

export function OutlineCard({
  slide, index, onChange, onDelete,
}: {
  slide: OutlineSlide
  index: number
  onChange: (patch: Partial<OutlineSlide>) => void
  onDelete: () => void
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ color: '#FF6600', fontSize: 13 }}>第 {index + 1} 页</strong>
        <Button type="text" size="small" danger onClick={onDelete}>× 删除</Button>
      </div>
      <Input
        value={slide.title}
        onChange={e => onChange({ title: e.target.value })}
        style={{ marginBottom: 6 }}
      />
      <TextArea
        rows={3}
        value={slide.bullets.join('\n')}
        onChange={e => onChange({ bullets: e.target.value.split('\n').filter(b => b.trim()) })}
        style={{ fontSize: 12 }}
      />
    </div>
  )
}
