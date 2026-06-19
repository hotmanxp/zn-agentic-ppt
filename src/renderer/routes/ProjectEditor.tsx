import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Input, Tabs, App as AntdApp } from 'antd'
import { api } from '../lib/api'
import { useGenerationStore } from '../stores/generation'
import { OutlineEditor } from '../components/OutlineEditor'
import { HtmlPreview } from '../components/HtmlPreview'
import { GenerationProgress } from '../components/GenerationProgress'
import type { ProjectDetail } from '@shared/types'

export function ProjectEditor() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { message } = AntdApp.useApp()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [outline, setOutline] = useState('')
  const [tab, setTab] = useState('split')
  const { phase, progress, html, error, start, cancel, reset } = useGenerationStore()

  useEffect(() => {
    api.project.get(id).then(p => {
      if (!p) { message.error('项目不存在'); nav('/projects'); return }
      setProject(p); setOutline(p.outline); if (p.html) useGenerationStore.setState({ html: p.html, phase: 'done' })
    })
  }, [id, message, nav])

  useEffect(() => {
    const u1 = api.generation.onProgress(({ current }) => useGenerationStore.setState({ progress: current }))
    const u2 = api.generation.onDone(({ html }) => { useGenerationStore.setState({ phase: 'done', html, runId: null }); message.success('生成完成') })
    const u3 = api.generation.onError(({ error }) => { useGenerationStore.setState({ phase: 'error', error: error.message, runId: null }); message.error(error.message) })
    return () => { u1(); u2(); u3() }
  }, [message])

  const saveOutline = useCallback(async (v: string) => {
    setOutline(v)
    await api.project.update(id, { outline: v })
  }, [id])

  const onGenerate = async () => {
    reset()
    await api.project.update(id, { outline })
    await start(id)
  }

  if (!project) return <div style={{ padding: 48 }}>加载中...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a onClick={() => nav('/projects')} style={{ color: '#9ca3af', cursor: 'pointer' }}>← 返回</a>
          <span style={{ opacity: 0.3 }}>|</span>
          <Input value={project.title} onChange={e => setProject(p => p ? { ...p, title: e.target.value } : p)}
                 onBlur={async () => { await api.project.rename(id, project.title) }}
                 variant="borderless" style={{ fontSize: 16, fontWeight: 600, width: 240 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={async () => {
            if (!project.html) return
            const blob = new Blob([project.html], { type: 'text/html' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = `${project.title}.html`
            a.click(); URL.revokeObjectURL(url)
          }}>导出 HTML</Button>
          <Button onClick={onGenerate} disabled={phase === 'streaming'}>重新生成</Button>
          <Button type="primary" onClick={onGenerate} disabled={phase === 'streaming' || !outline.trim()}>⚡ 生成 PPT</Button>
        </div>
      </div>
      <Tabs activeKey={tab} onChange={setTab} style={{ padding: '0 24px', background: '#f9fafb', margin: 0 }}
            items={[
              { key: 'split', label: '编辑 + 预览' },
              { key: 'preview', label: '仅预览' },
              { key: 'outline', label: '大纲' },
            ]} />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: tab === 'split' ? '1fr 1fr' : '1fr', background: '#f3f4f6', overflow: 'hidden' }}>
        {tab !== 'preview' && (
          <div style={{ borderRight: tab === 'split' ? '1px solid #e5e7eb' : 'none', background: '#fff', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <small style={{ color: '#6b7280' }}>📝 大纲（Markdown）— # = 一页幻灯片</small>
            </div>
            <div style={{ flex: 1, padding: 8 }}>
              <OutlineEditor value={outline} onChange={saveOutline} disabled={phase === 'streaming'} />
            </div>
          </div>
        )}
        {tab !== 'outline' && (
          <HtmlPreview html={phase === 'done' ? (html ?? project.html) : html} />
        )}
      </div>
      {phase === 'streaming' && (
        <div style={{ padding: 16, background: '#fff', borderTop: '1px solid #e5e7eb' }}>
          <GenerationProgress progress={progress} onCancel={cancel} />
        </div>
      )}
      {phase === 'error' && error && (
        <div style={{ padding: 16, background: '#fef2f2', borderTop: '1px solid #fecaca', color: '#dc2626' }}>
          生成失败：{error}
        </div>
      )}
    </div>
  )
}
