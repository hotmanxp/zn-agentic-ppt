import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Progress, App as AntdApp } from 'antd'
import { api } from '../lib/api'
import { ProjectStepper } from '../components/ProjectStepper'
import { usePptGenerationStore } from '../stores/pptGeneration'
import { useOutlineStore } from '../stores/outline'

export function GeneratePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { message } = AntdApp.useApp()
  const ppt = usePptGenerationStore()
  const outline = useOutlineStore(s => s.outline)
  const [started, setStarted] = useState(false)
  const [latestSlideHtml, setLatestSlideHtml] = useState<{ id: string; title: string; html: string } | null>(null)

  // Initialize slides from outline (if not already)
  useEffect(() => {
    if (outline && outline.slides.length > 0 && ppt.projectId !== id) {
      ppt.initialize(id, outline.slides.map(s => ({ id: s.id, title: s.title })))
    }
  }, [outline, id])

  // Auto-start on mount
  useEffect(() => {
    if (started) return
    if (!outline || outline.slides.length === 0) return
    setStarted(true)
    ppt.start(id)
  }, [outline, id, started])

  // Track the most recently completed slide for the live preview pane
  useEffect(() => {
    if (ppt.phase !== 'running') return
    const slides = Object.values(ppt.slides)
    const lastDone = slides.filter(s => s.status === 'done').sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))[0]
    if (lastDone?.html) {
      setLatestSlideHtml({ id: lastDone.id, title: lastDone.title, html: lastDone.html })
    }
  }, [ppt.completed])

  // Auto-navigate when done
  useEffect(() => {
    if (ppt.phase === 'done') {
      message.success(`完成 ${ppt.completed}/${ppt.total}`)
      setTimeout(() => nav(`/projects/${id}/fine-tune`), 800)
    } else if (ppt.phase === 'cancelled') {
      message.info('已取消')
    } else if (ppt.phase === 'error') {
      message.error('生成失败，请重试')
    }
  }, [ppt.phase])

  const onCancel = async () => {
    await ppt.cancel()
  }

  const slidesList = Object.values(ppt.slides)
  const percent = ppt.total > 0 ? Math.round((ppt.completed / ppt.total) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <ProjectStepper projectId={id} />
      <div style={{ flex: 1, padding: '32px 48px', background: '#fafbff', overflow: 'auto' }}>
        <h2 style={{ margin: '0 0 4px' }}>第 3 步 · 实时生成</h2>
        <p style={{ color: '#6b7280', margin: '0 0 20px' }}>
          {ppt.phase === 'running' && '并行调用 LLM 生成每张幻灯片...'}
          {ppt.phase === 'done' && '全部完成，即将跳到预览...'}
          {ppt.phase === 'cancelled' && '已取消'}
          {ppt.phase === 'error' && '生成失败，可返回修改大纲'}
        </p>

        <div style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 32 }}>⚡</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>生成中...</strong>
                <small style={{ color: '#6b7280' }}>{ppt.completed} / {ppt.total} 张完成 {ppt.failed > 0 ? `· ${ppt.failed} 失败` : ''}</small>
              </div>
              <Progress percent={percent} showInfo={false}
                status={ppt.phase === 'error' ? 'exception' : 'active'}
                strokeColor={{ from: '#1677ff', to: '#722ed1' }} />
            </div>
            {ppt.phase === 'running' && (
              <Button danger size="small" onClick={onCancel}>取消</Button>
            )}
          </div>

          {/* Per-slide live status */}
          <div style={{ marginTop: 16 }}>
            {slidesList.map((s, i) => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                borderBottom: i < slidesList.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 3, fontSize: 11,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: s.status === 'done' ? '#22c55e' : s.status === 'generating' ? '#fbbf24' : s.status === 'failed' ? '#ef4444' : '#d1d5db',
                  color: '#fff', fontWeight: 600,
                }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 13 }}>{s.title}</span>
                <small style={{ color: '#6b7280', fontSize: 11 }}>
                  {s.status === 'pending' && '等待中'}
                  {s.status === 'generating' && '生成中…'}
                  {s.status === 'done' && `${(s.durationMs ?? 0) / 1000}s`}
                  {s.status === 'failed' && (s.error ?? '失败')}
                </small>
              </div>
            ))}
          </div>
        </div>

        {/* Live HTML preview of the most recently completed slide */}
        {latestSlideHtml && (
          <div style={{ background: '#0b1020', borderRadius: 8, padding: 24, marginBottom: 20 }}>
            <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span>最新完成 · {latestSlideHtml.title}</span>
              <span>slide {latestSlideHtml.id}</span>
            </div>
            <pre style={{
              color: '#e2e8f0', fontSize: 11, lineHeight: 1.5, fontFamily: 'SF Mono, Monaco, monospace',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 360, overflow: 'auto', margin: 0,
            }}>{latestSlideHtml.html}</pre>
          </div>
        )}

        {ppt.phase === 'error' && (
          <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8 }}>
            生成失败
            <Button onClick={() => nav(`/projects/${id}/outline`)} style={{ marginLeft: 16 }}>← 返回大纲</Button>
          </div>
        )}
      </div>
    </div>
  )
}
