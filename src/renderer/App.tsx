import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { ConfigProvider, Layout, Menu, App as AntdApp } from 'antd'
import { Welcome } from './routes/Welcome'
import { Projects } from './routes/Projects'
import { Settings } from './routes/Settings'
import { CollectEditor } from './routes/CollectEditor'
import { OutlinePage } from './routes/OutlinePage'
import { FineTunePage } from './routes/FineTunePage'
import { useSettingsStore } from './stores/settings'
import { useStageStreamSubscription } from './hooks/useStageStreamSubscription'
import { useHtmlGenerationSubscription } from './hooks/useHtmlGenerationSubscription'

const { Header, Content } = Layout

export function App() {
  const load = useSettingsStore(s => s.load)
  useEffect(() => { load() }, [load])

  useStageStreamSubscription()
  useHtmlGenerationSubscription()

  return (
    <ConfigProvider>
      <AntdApp>
        <HashRouter>
          <Layout style={{ minHeight: '100vh' }}>
            <Header style={{ display: 'flex', alignItems: 'center', gap: 24, background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
              <strong style={{ color: '#1677ff', fontSize: 18 }}>⬢ ZN Agentic PPT</strong>
              <Menu mode="horizontal" selectedKeys={[]} style={{ flex: 1, border: 'none' }} items={[
                { key: '/', label: <NavLink to="/">欢迎</NavLink> },
                { key: '/projects', label: <NavLink to="/projects">项目</NavLink> },
                { key: '/settings', label: <NavLink to="/settings">设置</NavLink> },
              ]} />
            </Header>
            <Content>
              <Routes>
                <Route path="/" element={<Welcome />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:id" element={<Navigate to="collect" replace />} />
                <Route path="/projects/:id/collect" element={<CollectEditor />} />
                <Route path="/projects/:id/outline" element={<OutlinePage />} />
                <Route path="/projects/:id/fine-tune" element={<FineTunePage />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Content>
          </Layout>
        </HashRouter>
      </AntdApp>
    </ConfigProvider>
  )
}
