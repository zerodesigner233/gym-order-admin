import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

/**
 * 路由守卫。
 * 未登录访问受保护页面时，带上「原本要去哪」重定向到 /login，
 * 登录成功后可以跳回原页面（体验优于登录后一律回列表）。
 */
export default function RequireAuth() {
  const token = useAuthStore((state) => state.token)
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <Outlet />
}
