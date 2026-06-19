import { Input, Button } from 'antd'
import type { OutlineSlide } from '@shared/types'

const { TextArea } = Input

export function SlideEditor({
  slide, onChange, onRegenerate,
}: {
  slide: OutlineSlide
  onChange: (patch: Partial<OutlineSlide>) => void
  onRegenerate: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <small style={{ color: '#6b7280' }}>编辑当前页</small>
        <Button type="primary" size="small" onClick={onRegenerate}>↻ 重生成此页</Button>
      </div>
      <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>标题</label>
          <Input value={slide.title} onChange={e => onChange({ title: e.target.value })}
            style={{ fontSize: 14, fontWeight: 500 }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>要点（每行一个）</label>
          <TextArea rows={6} value={slide.bullets.join('\n')}
            onChange={e => onChange({ bullets: e.target.value.split('\n').filter(b => b.trim()) })}
            style={{ fontSize: 13, lineHeight: 1.6 }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>备注（可选）</label>
          <TextArea rows={2} value={slide.notes ?? ''} placeholder="给 LLM 的额外提示"
            onChange={e => onChange({ notes: e.target.value })} style={{ fontSize: 13 }} />
        </div>
      </div>
    </div>
  )
}
