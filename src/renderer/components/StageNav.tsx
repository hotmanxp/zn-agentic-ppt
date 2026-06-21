import { Button, App as AntdApp } from 'antd'
import { Link } from 'react-router-dom'

export function StageNav({ projectId, current, canBack = true, canNext = true, onNext, nextLabel = '下一步', dirty = false, leftAction }: {
  projectId: string
  current: 'collect' | 'outline' | 'generate' | 'fine-tune'
  canBack?: boolean
  canNext?: boolean
  onNext?: () => void
  nextLabel?: string
  dirty?: boolean
  /** Extra element rendered to the LEFT of "← 上一步" (e.g. a Save button). */
  leftAction?: React.ReactNode
}) {
  const { modal } = AntdApp.useApp()
  const order: typeof current[] = ['collect', 'outline', 'generate', 'fine-tune']
  const idx = order.indexOf(current)
  const back = idx > 0 ? order[idx - 1] : null

  const handleNext = () => {
    if (!onNext) return
    if (dirty) {
      modal.confirm({
        title: '有未保存的修改',
        content: '当前页面的修改尚未保存。是否继续？',
        okText: '继续（放弃修改）',
        cancelText: '取消',
        onOk: () => onNext(),
      })
    } else {
      onNext()
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, background: '#fff', borderTop: '1px solid #e5e7eb', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {leftAction}
        {back ? (
          <Link to={`/projects/${projectId}/${back}`}>
            <Button disabled={!canBack}>← 上一步</Button>
          </Link>
        ) : null}
      </div>
      {onNext ? (
        <Button type="primary" disabled={!canNext} onClick={handleNext}>{nextLabel} →</Button>
      ) : <div />}
    </div>
  )
}
