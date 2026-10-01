import { App as AntdApp } from 'antd'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { bindNavigator, bindToast } from '../utils/appBridge'

/**
 * 把 React 上下文里的能力（antd message / router navigate）注入到模块级桥接层，
 * 供 axios 拦截器与 zustand store 使用。
 *
 * 这样拦截器既能拿到带 ConfigProvider 主题上下文的 message，
 * 又不需要反向 import 组件，避免循环依赖。
 *
 * 本组件必须渲染在 <AntdApp> 与 <Router> 内部。
 */
export default function GlobalProviders({ children }) {
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // 传入 { message } 而不是裸的 message 实例：
    // appBridge 的 toast.* 约定从绑定对象上取 .message，直接绑定实例会取到 undefined
    bindToast({ message })
  }, [message])

  useEffect(() => {
    bindNavigator(navigate)
  }, [navigate])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return children
}
