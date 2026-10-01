/**
 * 登录态（zustand + localStorage 持久化）。
 *
 * token 的唯一可信来源是 localStorage：刷新页面后 store 的初始值直接读它，
 * 避免出现「store 说已登录、storage 没 token」的假登录态。
 */

import { create } from 'zustand'
import { login as loginRequest } from '../api/auth'
import { navigateTo, setUnauthorizedHandler, toast } from '../utils/appBridge'
import {
  clearAuthStorage,
  getStoredUser,
  getToken,
  setStoredUser,
  setToken,
} from '../utils/storage'

export const useAuthStore = create((set, get) => ({
  token: getToken(),
  user: getStoredUser(),

  /** 未登录时为 false */
  isLoggedIn: () => Boolean(get().token),

  /**
   * 登录
   * @returns {Promise<{ ok: boolean, message?: string, user?: object }>}
   */
  login: async (username, password) => {
    try {
      const response = await loginRequest({ username: String(username).trim(), password })
      const { token, user } = response.data.data

      setToken(token)
      setStoredUser(user)
      set({ token, user })

      return { ok: true, user }
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || '登录失败，请稍后重试'
      return { ok: false, message }
    }
  },

  /** 退出登录：清 token + 清用户 + 回到登录页 */
  logout: () => {
    clearAuthStorage()
    set({ token: null, user: null })
  },
}))

/**
 * axios 收到 401 时的统一处理（由 request.js 调用）。
 * 放在模块顶层注册，保证只要 authStore 被加载过一次就一定生效。
 */
setUnauthorizedHandler(() => {
  const { token, logout } = useAuthStore.getState()
  if (!token) return // 本来就没登录，交给路由守卫处理，避免重复跳转

  logout()
  toast.warning('登录状态已失效，请重新登录')
  navigateTo('/login', { replace: true })
})

/** 组件里便捷读取 */
export const selectUser = (state) => state.user
export const selectToken = (state) => state.token
