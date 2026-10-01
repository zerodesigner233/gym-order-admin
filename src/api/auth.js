import request from './request'

/**
 * 登录（模拟：任意非空账号密码均可通过）
 * @param {{ username: string, password: string }} payload
 */
export function login(payload) {
  return request.post('/auth/login', payload)
}