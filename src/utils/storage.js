/**
 * localStorage 读写封装。
 * 单独抽出来的原因：axios 拦截器需要同步拿到 token，
 * 而 zustand store 会与 api 层形成循环依赖，所以底层存储读写必须保持零依赖。
 */

const TOKEN_KEY = 'gym_order_admin_token'
const USER_KEY = 'gym_order_admin_user'

function safeGet(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    // 隐私模式 / 禁用 storage 时降级为「未登录」，不阻断渲染
    return null
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* 忽略写入失败 */
  }
}

function safeRemove(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* 忽略 */
  }
}

export function getToken() {
  return safeGet(TOKEN_KEY)
}

export function setToken(token) {
  safeSet(TOKEN_KEY, token)
}

export function getStoredUser() {
  const raw = safeGet(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    safeRemove(USER_KEY)
    return null
  }
}

export function setStoredUser(user) {
  safeSet(USER_KEY, JSON.stringify(user))
}

export function clearAuthStorage() {
  safeRemove(TOKEN_KEY)
  safeRemove(USER_KEY)
}

export const STORAGE_KEYS = { TOKEN_KEY, USER_KEY }
