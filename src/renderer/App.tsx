import { ConfigProvider, App as AntdApp } from 'antd'
import { Workbench } from './workbench/Workbench.js'

export function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#FF8839',
          colorInfo: '#FF8839',
          colorLink: '#FF8839',
        },
      }}
    >
      <AntdApp>
        <Workbench />
      </AntdApp>
    </ConfigProvider>
  )
}