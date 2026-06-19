import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Input, App as AntdApp } from 'antd'
import { api } from '../lib/api'
import { ProjectStepper } from '../components/ProjectStepper'
import { StageNav } from '../components/StageNav'
import { useOutlineStore } from '../stores/outline'

const { TextArea } = Input

export function CollectEditor() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { message } = AntdApp.useApp()
  const [topic, setTopic] = useState('')
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(false)
  const generate = useOutlineStore(s => s.generate)

  useEffect(() => {
    (async () => {
      const p = await api.project.get(id)
      if (p) setTopic(p.topic)
      // load source from fs via api (use a read-source ipc — for MVP read via project.get or skip)
    })()
  }, [id])

  const onNext = async () => {
    if (!source.trim()) { message.warning('请先粘贴内容'); return }
    setLoading(true)
    try {
      await generate(id, topic, source)
      nav(`/projects/${id}/outline`)
    } catch (e: any) {
      message.error(e.message ?? '生成大纲失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <ProjectStepper projectId={id} />
      <div style={{ flex: 1, padding: '32px 48px', background: '#fafbff', overflow: 'auto' }}>
        <h2 style={{ margin: '0 0 4px' }}>第 1 步 · 内容收集</h2>
        <p style={{ color: '#6b7280', margin: '0 0 20px' }}>粘贴你的素材，下一步 LLM 会整理成 PPT 大纲。</p>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <Input
            placeholder="项目主题"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <TextArea
            rows={14}
            value={source}
            onChange={e => setSource(e.target.value)}
            placeholder="把你的内容粘贴到这里..."
            style={{ fontFamily: 'SF Mono, Monaco, monospace', fontSize: 13, lineHeight: 1.6 }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <small style={{ color: '#9ca3af' }}>字符数：{source.length} · 约 3-5 秒生成大纲</small>
        </div>
      </div>
      <StageNav projectId={id} current="collect" canNext={source.trim().length > 0} onNext={onNext} nextLabel={loading ? '生成中...' : '下一步：生成大纲'} />
    </div>
  )
}
