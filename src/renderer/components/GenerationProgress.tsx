import { Button, Progress } from 'antd'

export function GenerationProgress({ progress, onCancel }: {
  progress: number
  onCancel: () => void
}) {
  return (
    <div style={{ padding: 14, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ fontSize: 20 }}>⚡</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <strong style={{ fontSize: 13 }}>生成中…</strong>
          <small style={{ color: '#6b7280' }}>已生成 {progress} 字符</small>
        </div>
        <Progress percent={Math.min(99, progress / 50)} showInfo={false} strokeColor={{ from: '#1677ff', to: '#722ed1' }} />
      </div>
      <Button danger size="small" onClick={onCancel}>取消</Button>
    </div>
  )
}
