import { Button } from 'antd'
import { Link } from 'react-router-dom'

export function StageNav({ projectId, current, canBack = true, canNext = true, onNext, nextLabel = '下一步' }: {
  projectId: string
  current: 'collect' | 'outline' | 'generate' | 'fine-tune'
  canBack?: boolean
  canNext?: boolean
  onNext?: () => void
  nextLabel?: string
}) {
  const order: typeof current[] = ['collect', 'outline', 'generate', 'fine-tune']
  const idx = order.indexOf(current)
  const back = idx > 0 ? order[idx - 1] : null

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: 16, background: '#fff', borderTop: '1px solid #e5e7eb' }}>
      {back ? (
        <Link to={`/projects/${projectId}/${back}`}>
          <Button disabled={!canBack}>← 上一步</Button>
        </Link>
      ) : <div />}
      {onNext ? (
        <Button type="primary" disabled={!canNext} onClick={onNext}>{nextLabel} →</Button>
      ) : <div />}
    </div>
  )
}
