import { useEffect, useState } from 'react'
import { Button, Input, Tag, App as AntdApp } from 'antd'
import { api } from '../lib/api.js'
import type { PromptSpec } from './PromptSettings.js'

const { TextArea } = Input

export function PromptEditor({ spec, onChange }: { spec: PromptSpec; onChange?: () => void }) {
  const { message, modal } = AntdApp.useApp()
  const [text, setText] = useState('')
  const [override, setOverride] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    api.settings.prompts.get(spec.id).then(o => {
      setOverride(o)
      setText(o ?? spec.defaultTemplate)
      setDirty(false)
    })
  }, [spec.id, spec.defaultTemplate])

  const onSave = async () => {
    setSaving(true)
    try {
      await api.settings.prompts.set(spec.id, text)
      setOverride(text)
      setDirty(false)
      message.success('已保存')
      onChange?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(msg || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onReset = () => {
    modal.confirm({
      title: '重置为默认',
      content: '将删除当前自定义模板，恢复为系统内置默认。',
      okText: '重置',
      cancelText: '取消',
      onOk: async () => {
        await api.settings.prompts.reset(spec.id)
        setOverride(null)
        setText(spec.defaultTemplate)
        setDirty(false)
        message.success('已重置为默认')
        onChange?.()
      },
    })
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>{spec.title}</h3>
          <small style={{ color: '#6b7280' }}>{spec.description}</small>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={onReset} disabled={override === null}>重置为默认</Button>
          <Button type="primary" onClick={onSave} loading={saving} disabled={!dirty}>保存</Button>
        </div>
      </div>
      <TextArea
        value={text}
        onChange={e => { setText(e.target.value); setDirty(true) }}
        rows={14}
        style={{ fontFamily: 'SF Mono, Monaco, monospace', fontSize: 13, lineHeight: 1.6 }}
      />
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>模板变量</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {spec.variables.map(v => (
            <div key={v.name} style={{ background: '#f3f4f6', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>
              <Tag color={v.type === 'json' ? 'purple' : 'blue'} style={{ marginRight: 4 }}>{v.type}</Tag>
              <code>{`{{${v.name}}}`}</code>
              <span style={{ color: '#6b7280', marginLeft: 6 }}>{v.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
