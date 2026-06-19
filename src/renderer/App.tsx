import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import { useEffect } from 'react'
import { ConfigProvider, Layout, Menu } from 'antd'
import { Welcome } from './routes/Welcome'
import { Projects } from './routes/Projects'
import { ProjectEditor } from './routes/ProjectEditor'
import { Settings } from './routes/Settings'
import { useSettingsStore } from './stores/settings'

const { Header, Content } = Layout

export function App() {
  const load = useSettingsStore(s => s.load)
  useEffect(() => { load() }, [load])

  return (
    <ConfigProvider>
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
              <Route path="/projects/:id" element={<ProjectEditor />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Content>
        </Layout>
      </HashRouter>
    </ConfigProvider>
  )
}
