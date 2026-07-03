import { useEffect, useState } from 'react'
import { App as AntdApp, Button, Form, Input, Modal, Select } from 'antd'
import { useSettingsStore } from '../stores/settings.js'
import { PromptSettings } from '../components/PromptSettings.js'

const TABS = [
  { key: 'llm', label: 'LLM 服务' },
  { key: 'prompts', label: '提示词' },
] as const

type TabKey = (typeof TABS)[number]['key']

export function SettingsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [tab, setTab] = useState<TabKey>('llm')

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={960}
      title="设置"
      destroyOnHidden
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: 540 }}>
        <div style={{ background: '#f9fafb', borderRight: '1px solid #e5e7eb', padding: '16px 8px' }}>
          {TABS.map((t) => (
            <div
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '8px 12px',
                color: tab === t.key ? '#FF8839' : '#374151',
                background: tab === t.key ? '#fef0e4' : 'transparent',
                borderRadius: 6,
                fontWeight: tab === t.key ? 500 : 400,
                fontSize: 14,
                cursor: 'pointer',
                marginBottom: 4,
              }}
            >
              {t.label}
            </div>
          ))}
        </div>
        <div style={{ padding: '24px 32px', maxHeight: 540, overflowY: 'auto' }}>
          {tab === 'llm' ? <LLMForm /> : <PromptSettings />}
        </div>
      </div>
    </Modal>
  )
}

function LLMForm() {
  const { settings, load, save } = useSettingsStore()
  const [testResult, setTestResult] = useState<{ ok: boolean; models?: string[]; error?: string } | null>(null)
  const [form, setForm] = useState(settings)
  const { message } = AntdApp.useApp()

  useEffect(() => { load() }, [load])
  useEffect(() => { setForm(settings) }, [settings])
  if (!form) return <div style={{ padding: 24 }}>加载中...</div>

  const update = (patch: Partial<typeof form.llm>) =>
    setForm((s) => s ? { ...s, llm: { ...s.llm, ...patch } } : s)

  return (
    <>
      <h2 style={{ margin: '0 0 4px' }}>LLM 服务</h2>
      <p style={{ color: '#6b7280', margin: '0 0 24px', fontSize: 14 }}>
        配置用于生成 PPT 的 LLM 服务。设置存在本地，不会发送到外部。
      </p>
      <Form layout="vertical">
        <Form.Item label="服务提供方">
          <Select
            value={form.llm.provider}
            onChange={(v) => update({ provider: v })}
            options={[
              { value: 'anthropic', label: 'Anthropic 兼容（默认）' },
              { value: 'openai', label: 'OpenAI 兼容' },
              { value: 'custom', label: '自定义' },
            ]}
          />
        </Form.Item>
        <Form.Item label="API Base URL">
          <Input
            value={form.llm.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value })}
            style={{ fontFamily: 'monospace' }}
          />
        </Form.Item>
        <Form.Item label="API Key" extra="存储于本地，明文。后续版本将加密。">
          <Input.Password
            value={form.llm.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
            style={{ fontFamily: 'monospace' }}
          />
        </Form.Item>
        <Form.Item label="模型" extra="留空使用服务默认模型">
          <Input
            value={form.llm.model}
            onChange={(e) => update({ model: e.target.value })}
            style={{ fontFamily: 'monospace' }}
            addonAfter={
              <Button
                size="small"
                type="link"
                onClick={async () => {
                  try {
                    const r = await window.api.settings.testConnection()
                    setTestResult(r)
                    if (r.ok) message.success(`连接成功，${r.models?.length ?? 0} 个模型`)
                    else message.error(r.error ?? '连接失败')
                  } catch (e) {
                    message.error(String(e))
                  }
                }}
              >
                测试连接
              </Button>
            }
          />
        </Form.Item>
        {testResult && (
          <div
            style={{
              padding: 12,
              background: testResult.ok ? '#f0fdf4' : '#fef2f2',
              borderRadius: 6,
              marginBottom: 16,
              color: testResult.ok ? '#16a34a' : '#dc2626',
            }}
          >
            {testResult.ok
              ? `✓ 连接成功${testResult.models ? `，模型：${testResult.models.join(', ')}` : ''}`
              : `✗ ${testResult.error}`}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            paddingTop: 16,
            borderTop: '1px solid #e5e7eb',
          }}
        >
          <Button onClick={() => setForm(settings)}>恢复</Button>
          <Button
            type="primary"
            onClick={async () => {
              if (form) {
                await save(form)
                message.success('已保存')
              }
            }}
          >
            保存设置
          </Button>
        </div>
      </Form>
    </>
  )
}