import { DEFAULT_STYLE, type StyleSettings } from '@shared/types'

const COLORS = ['#FF6600', '#FF8C42', '#16a34a', '#dc2626', '#0f172a']
const LAYOUTS = [
  { key: 'minimal' as const, label: '简约 16:9' },
  { key: 'fullbg' as const, label: '全屏背景' },
  { key: 'columns' as const, label: '分栏布局' },
]

export function StyleControls({ style, onChange }: {
  style: StyleSettings
  onChange: (patch: Partial<StyleSettings>) => void
}) {
  return (
    <div style={{ paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
      <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
        样式（应用到全部页）
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {COLORS.map(c => (
          <div key={c} onClick={() => onChange({ primaryColor: c })} style={{
            padding: '6px 12px',
            border: style.primaryColor === c ? '2px solid #FF6600' : '1px solid #d1d5db',
            background: style.primaryColor === c ? '#eff6ff' : 'white',
            borderRadius: 16, fontSize: 12, cursor: 'pointer',
          }}>{c} {c === DEFAULT_STYLE.primaryColor ? '(默认)' : ''}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {LAYOUTS.map(l => (
          <div key={l.key} onClick={() => onChange({ layout: l.key })} style={{
            padding: '6px 12px',
            border: style.layout === l.key ? '2px solid #FF6600' : '1px solid #d1d5db',
            background: style.layout === l.key ? '#eff6ff' : 'white',
            borderRadius: 6, fontSize: 12, cursor: 'pointer',
          }}>{l.label}</div>
        ))}
      </div>
    </div>
  )
}
