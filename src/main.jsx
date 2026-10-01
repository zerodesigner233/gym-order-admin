import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import GlobalProviders from './components/GlobalProviders'
// 副作用导入：注册 axios 401 的统一处理函数（logout + 跳登录页）
import './stores/authStore'
import './styles/global.css'

dayjs.locale('zh-cn')

createRoot(document.getElementById('root')).render(
  <ConfigProvider
    locale={zhCN}
    theme={{
      token: {
        colorPrimary: '#1677ff',
        borderRadius: 6,
        fontSize: 14,
      },
      components: {
        Layout: { headerBg: '#ffffff', bodyBg: '#f5f6f8' },
      },
    }}
  >
    <AntdApp>
      <BrowserRouter>
        <GlobalProviders>
          <App />
        </GlobalProviders>
      </BrowserRouter>
    </AntdApp>
  </ConfigProvider>,
)
