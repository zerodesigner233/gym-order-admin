/**
 * axios 实例（请求层）。
 *
 * 职责：
 *  1. baseURL 统一前缀
 *  2. 请求拦截器注入 Authorization: Bearer <token>
 *  3. 响应拦截器统一错误提示；401 时清登录态并跳回 /login
 *
 * 说明：`adapter: mockAdapter` 是本项目的「模拟后端」。
 * 接入真实后端时删除这一行即可，业务代码无需任何改动。
 */

import axios from 'axios'
import { mockAdapter } from '../mock/server'
import { runUnauthorizedHandler, toast } from '../utils/appBridge'
import { getToken } from '../utils/storage'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  adapter: mockAdapter,
})

/* ------------------------------ 请求拦截器 ------------------------------- */

request.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    } else {
      delete config.headers.Authorization
    }
    return config
  },
  (error) => Promise.reject(error),
)

/* ------------------------------ 响应拦截器 ------------------------------- */

/** 业务码非 0 时抛出，供页面 catch */
export class BizError extends Error {
  constructor(message, code, response) {
    super(message)
    this.name = 'BizError'
    this.code = code
    this.response = response
  }
}

/** 并发 401 时只提示 / 登出一次 */
let handlingUnauthorized = false

function handleUnauthorized() {
  if (handlingUnauthorized) return
  handlingUnauthorized = true
  runUnauthorizedHandler()
  // 放开门闩，允许用户重新登录后再遇到 401
  setTimeout(() => {
    handlingUnauthorized = false
  }, 500)
}

request.interceptors.response.use(
  (response) => {
    const payload = response?.data

    // 统一处理业务错误：HTTP 200 但 code !== 0
    if (payload && typeof payload === 'object' && typeof payload.code === 'number' && payload.code !== 0) {
      const message = payload.message || '请求失败'
      toast.error(message)
      return Promise.reject(new BizError(message, payload.code, response))
    }

    return response
  },
  (error) => {
    const status = error?.response?.status
    const payload = error?.response?.data

    if (status === 401) {
      // 不再弹通用错误提示，由 authStore 统一给「登录态失效」的提示
      handleUnauthorized()
      return Promise.reject(error)
    }

    let message = payload?.message || error?.message || '网络异常，请稍后重试'
    if (status === 404) message = '请求的资源不存在'
    else if (status === 500) message = '服务器开小差了，请稍后重试'
    else if (error?.code === 'ECONNABORTED') message = '请求超时，请稍后重试'
    else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      message = '网络连接已断开，请检查网络'
    }

    toast.error(message)
    return Promise.reject(error)
  },
)

export default request