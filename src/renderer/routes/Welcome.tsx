import { useEffect } from 'react'
import { Button, Row, Col } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '../stores/project'

export function Welcome() {
  const { projects, load } = useProjectStore()
  const nav = useNavigate()
  useEffect(() => { load() }, [load])

  const recent = projects.slice(0, 4)

  return (
    <div>
      <div style={{ padding: '80px 48px 48px', textAlign: 'center', background: 'linear-gradient(180deg,#fafbff,#fff)' }}>
        <h1 style={{ fontSize: 52, margin: '0 0 16px', background: 'linear-gradient(90deg,#FF6600,#FF8C42)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          用 AI 几秒生成演示文稿
        </h1>
        <p style={{ fontSize: 18, color: '#6b7280', marginBottom: 32 }}>输入主题和大纲，Agent 输出可直接演示的 HTML PPT</p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <Button type="primary" size="large" onClick={() => nav('/projects')}>+ 新建项目</Button>
          <Button size="large" onClick={() => nav('/projects')}>打开已有项目</Button>
        </div>
      </div>
      <div style={{ padding: '32px 48px 64px' }}>
        <h3>最近的项目</h3>
        <Row gutter={[16, 16]}>
          {recent.map(p => (
            <Col key={p.id} span={6}>
              <div onClick={() => nav(`/projects/${p.id}`)} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, cursor: 'pointer' }}>
                <div style={{ fontWeight: 500 }}>{p.title}</div>
                <small style={{ color: '#9ca3af' }}>{new Date(p.updatedAt).toLocaleString('zh-CN')}</small>
              </div>
            </Col>
          ))}
        </Row>
      </div>
    </div>
  )
}
