import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import RequireAuth from './components/RequireAuth'

/* 页面级懒加载：首屏只加载登录页与布局，其余按需拉取 */
const LoginPage = lazy(() => import('./pages/Login'))
const OrderListPage = lazy(() => import('./pages/OrderList'))
const OrderCreatePage = lazy(() => import('./pages/OrderCreate'))
const NotFoundPage = lazy(() => import('./pages/NotFound'))

function PageFallback() {
  return <div style={{ padding: 48, textAlign: 'center', color: '#999' }}>加载中…</div>
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* 登录页：已登录时直接回列表 */}
        <Route path="/login" element={<LoginPage />} />

        {/* 受保护页面：左侧菜单 + 顶栏 + 面包屑 + 内容区 */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/orders" element={<OrderListPage />} />
            <Route path="/orders/new" element={<OrderCreatePage />} />
          </Route>
        </Route>

        {/* 根路径兜底 */}
        <Route path="/" element={<Navigate to="/orders" replace />} />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
