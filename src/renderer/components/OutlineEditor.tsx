import { Input } from 'antd'

const { TextArea } = Input

export function OutlineEditor({ value, onChange, disabled }: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <TextArea
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{ height: '100%', fontFamily: 'SF Mono, Monaco, monospace', fontSize: 13, lineHeight: 1.7, resize: 'none' }}
      placeholder={`# 项目主题\n\n## 第一节\n- 要点 1\n- 要点 2\n\n# 第二节\n...`}
    />
  )
}
