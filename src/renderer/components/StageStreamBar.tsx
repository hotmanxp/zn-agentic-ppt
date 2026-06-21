import { useEffect, useRef } from 'react'
import { Button, Progress, App as AntdApp } from 'antd'
import { useStageStreamStore, type StreamKind } from '../stores/stageStream.js'
import type { OutlineSlide } from '../lib/api.js'
import { HtmlStream } from './HtmlStream.js'

export interface StageStreamBarProps {
  projectId: string
  slideId?: string
  kind: StreamKind
  /** Called when phase transitions to 'done'. Receives the start() result. */
  onDone: (result: { slides?: OutlineSlide[]; html?: string }) => void
  /** Optional label override. */
  label?: string
}

export function StageStreamBar({ projectId, slideId, kind, onDone, label }: StageStreamBarProps) {
  const { message } = AntdApp.useApp()
  const phase = useStageStreamStore(s => s.phase)
  const chars = useStageStreamStore(s => s.chars)
  const html = useStageStreamStore(s => s.html)
  const error = useStageStreamStore(s => s.error)
  const start = useStageStreamStore(s => s.start)
  const cancel = useStageStreamStore(s => s.cancel)
  const reset = useStageStreamStore(s => s.reset)
  const startedRef = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    if (kind === 'outline') {
      start('outline', projectId).then(r => {
        if (r.phase === 'done') {
          onDoneRef.current({ slides: r.slides })
          reset()
        } else if (r.phase === 'cancelled') {
          message.info('已取消')
          reset()
        } else {
          message.error(r.error ?? '生成失败')
          reset()
        }
      })
    } else {
      if (!slideId) return
      start('slide-regen', projectId, slideId).then(r => {
        if (r.phase === 'done') {
          onDoneRef.current({ html: r.html })
          reset()
        } else if (r.phase === 'cancelled') {
          message.info('已取消')
          reset()
        } else {
          message.error(r.error ?? '重生成失败')
          reset()
        }
      })
    }
  }, [kind, projectId, slideId, start, reset, message])

  if (phase === 'idle') return null

  const displayLabel = label ?? (kind === 'outline' ? '正在生成大纲…' : '正在重生成页面…')

  return (
    <div style={{
      padding: 14, background: '#eff6ff', border: '1px solid #bfdbfe',
      borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 20 }}>⚡</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <strong style={{ fontSize: 13 }}>{displayLabel}</strong>
            <small style={{ color: '#6b7280' }}>已生成 {chars} 字符</small>
          </div>
          <Progress percent={Math.min(99, chars / 50)} showInfo={false}
            strokeColor={{ from: '#FF6600', to: '#FF8C42' }} />
        </div>
        <Button danger size="small" disabled={phase === 'cancelling'} onClick={() => cancel()}>
          {phase === 'cancelling' ? '取消中…' : '取消'}
        </Button>
      </div>
      {kind === 'slide-regen' && html && (
        <HtmlStream html={html} />
      )}
      {phase === 'error' && error && (
        <div style={{ color: '#dc2626', fontSize: 12 }}>错误：{error}</div>
      )}
    </div>
  )
}
