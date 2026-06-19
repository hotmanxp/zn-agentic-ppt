import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Progress, App as AntdApp } from 'antd'
import { api } from '../lib/api'
import { ProjectStepper } from '../components/ProjectStepper'
import { HtmlStream } from '../components/HtmlStream'
import { useGenerationStore } from '../stores/generation'
import { useOutlineStore } from '../stores/outline'

export function GeneratePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { message } = AntdApp.useApp()
  const { phase, progress, html, error, start, reset } = useGenerationStore()
  const [streamed, setStreamed] = useState('')
  const generate = useOutlineStore(s => s.generateHtml)

  useEffect(() => {
    const u1 = api.generation.onProgress(({ current }: any) => useGenerationStore.setState({ progress: current }))
    const u2 = api.generation.onDone(({ html, durationMs }: any) => {
      useGenerationStore.setState({ phase: 'done', html, runId: null })
      message.success(`生成完成 (${(durationMs / 1000).toFixed(1)}s)`)
      setTimeout(() => nav(`/projects/${id}/fine-tune`), 1500)
    })
    const u3 = api.generation.onError(({ error }: any) => {
      useGenerationStore.setState({ phase: 'error', error: error.message, runId: null })
      message.error(error.message)
    })
    return () => { u1(); u2(); u3() }
  }, [id, message, nav])

  useEffect(() => {
    if (phase === 'idle') {
      reset()
      setStreamed('')
      start(id).catch(e => message.error(String(e)))
    }
  }, [phase, id, start, reset, message])

  useEffect(() => {
    if (html) setStreamed(s => s + html.slice(s.length))
  }, [html])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <ProjectStepper projectId={id} />
      <div style={{ flex: 1, padding: '32px 48px', background: '#fafbff', overflow: 'auto' }}>
        <h2 style={{ margin: '0 0 4px' }}>第 3 步 · 正在生成</h2>
        <p style={{ color: '#6b7280', margin: '0 0 20px' }}>
          {phase === 'streaming' && '调 LLM 把大纲转成 HTML...'}
          {phase === 'done' && '生成完成，即将跳转...'}
          {phase === 'error' && '生成失败，可返回修改大纲'}
        </p>
        <div style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 32 }}>⚡</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>生成中...</strong>
                <small style={{ color: '#6b7280' }}>已生成 {progress} 字符</small>
              </div>
              <Progress percent={Math.min(99, progress / 50)} showInfo={false}
                strokeColor={{ from: '#1677ff', to: '#722ed1' }} />
            </div>
          </div>
          <HtmlStream html={streamed} />
        </div>
        {phase === 'error' && error && (
          <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8 }}>
            生成失败：{error}
            <Button onClick={() => nav(`/projects/${id}/outline`)} style={{ marginLeft: 16 }}>← 返回大纲</Button>
          </div>
        )}
      </div>
    </div>
  )
}
