/**
 * 模拟服务端：实现为一个自定义 axios adapter。
 *
 * 为什么用 adapter 而不是拦截器 / mock 库：
 *  - adapter 位于「请求拦截器之后、响应拦截器之前」，
 *    所以 token 注入、错误统一处理、401 跳转这些真实链路都能完整跑到，
 *    而不是绕过 axios 主流程另起一套。
 *  - 换成真实后端时只需删掉 request.js 里的 `adapter: mockAdapter`，业务代码零改动。
 */

import { AxiosError, AxiosHeaders } from 'axios'
import { MAX_YEARS, MIN_YEARS } from '../constants/order'
import { cancelOrders, createOrder, queryAllOrders, queryOrders, renewOrders } from './db'

const MOCK_ORIGIN = 'http://mock.local'
const TOKEN_PREFIX = 'mock-token-'

/** 模拟网络延迟，让 loading 状态真实可见 */
function delay(min = 180, max = 460) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 业务错误：会被转成 HTTP 400 + code!=0 的响应 */
class MockBizError extends Error {
  constructor(message, code = 40000) {
    super(message)
    this.name = 'MockBizError'
    this.code = code
  }
}

/** 构造成功响应 */
function buildResponse(config, data, status = 200) {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new AxiosHeaders({ 'content-type': 'application/json;charset=utf-8' }),
    config,
    request: { __mock: true },
  }
}

/** 构造错误响应（会走 reject 分支，从而命中响应拦截器的 error handler） */
function buildErrorResponse(config, status, message, code) {
  return {
    data: { code, message, data: null },
    status,
    statusText: 'Error',
    headers: new AxiosHeaders({ 'content-type': 'application/json;charset=utf-8' }),
    config,
    request: { __mock: true },
  }
}

/** 与 axios 内部 settle 一致：命中 validateStatus 就 resolve，否则 reject */
function settle(response) {
  const validateStatus = response.config?.validateStatus
  if (!response.status || !validateStatus || validateStatus(response.status)) {
    return Promise.resolve(response)
  }

  const kind =
    [AxiosError.ERR_BAD_REQUEST, AxiosError.ERR_BAD_RESPONSE][Math.floor(response.status / 100) - 4] ||
    AxiosError.ERR_BAD_RESPONSE

  return Promise.reject(
    new AxiosError(
      `Request failed with status code ${response.status}`,
      kind,
      response.config,
      response.request,
      response,
    ),
  )
}

function readToken(config) {
  const headers = config.headers
  if (!headers) return ''
  const raw = typeof headers.get === 'function' ? headers.get('Authorization') : headers.Authorization
  return raw ? String(raw).replace(/^Bearer\s+/i, '') : ''
}

/** 解析请求体（axios 在到达 adapter 前已按 transformRequest 处理过，这里兼容字符串/对象） */
function readBody(config) {
  const raw = config.data
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }
  return raw
}

const PHONE_RE = /^1[3-9]\d{9}$/

/* -------------------------------------------------------------------------- */
/* 路由处理                                                                    */
/* -------------------------------------------------------------------------- */

function handleLogin(config) {
  const { username, password } = readBody(config)
  if (!username || !String(username).trim()) {
    return buildErrorResponse(config, 400, '请输入账号', 40001)
  }
  if (!password || !String(password).length) {
    return buildErrorResponse(config, 400, '请输入密码', 40002)
  }

  return buildResponse(config, {
    code: 0,
    message: 'ok',
    data: {
      token: `${TOKEN_PREFIX}${username}-${Date.now().toString(36)}`,
      user: {
        id: `u_${String(username).trim()}`,
        username: String(username).trim(),
        // 任何账号密码都能登录，这里按需造一个展示名
        nickname: `${String(username).trim()}（管理员）`,
        role: 'admin',
      },
    },
  })
}

function handleOrderList(config, url) {
  const page = url.searchParams.get('page')
  const pageSize = url.searchParams.get('pageSize')
  const tab = url.searchParams.get('tab') || 'all'
  const orderNo = url.searchParams.get('orderNo') || ''
  const memberName = url.searchParams.get('memberName') || ''

  const data = queryOrders({ page, pageSize, tab, orderNo, memberName })
  return buildResponse(config, { code: 0, message: 'ok', data })
}

function handleOrderExportList(config, url) {
  const tab = url.searchParams.get('tab') || 'all'
  const orderNo = url.searchParams.get('orderNo') || ''
  const memberName = url.searchParams.get('memberName') || ''
  const list = queryAllOrders({ tab, orderNo, memberName })
  return buildResponse(config, { code: 0, message: 'ok', data: { list, total: list.length } })
}

function handleCreateOrder(config) {
  const body = readBody(config)
  const name = String(body.memberName || '').trim()
  const phone = String(body.phone || '').trim()
  const years = Number(body.years)
  const remark = String(body.remark || '')

  if (name.length < 2 || name.length > 30) {
    return buildErrorResponse(config, 400, '会员姓名长度需为 2~30 个字符', 40010)
  }
  if (!PHONE_RE.test(phone)) {
    return buildErrorResponse(config, 400, '联系手机号格式不正确', 40011)
  }
  if (!Number.isInteger(years) || years < MIN_YEARS || years > MAX_YEARS) {
    return buildErrorResponse(config, 400, `购卡年限需为 ${MIN_YEARS}~${MAX_YEARS} 的整数`, 40012)
  }
  if (remark.length > 200) {
    return buildErrorResponse(config, 400, '备注最多 200 字', 40013)
  }

  const created = createOrder({ memberName: name, phone, years, remark })
  return buildResponse(config, { code: 0, message: 'ok', data: created })
}

function handleBatchRenew(config) {
  const body = readBody(config)
  const ids = Array.isArray(body.ids) ? body.ids : []
  const years = Number(body.years)

  if (!ids.length) return buildErrorResponse(config, 400, '请先选择要续卡的订单', 40020)
  if (!Number.isInteger(years) || years < MIN_YEARS || years > MAX_YEARS) {
    return buildErrorResponse(
      config,
      400,
      `续卡年限需为 ${MIN_YEARS}~${MAX_YEARS} 的整数`,
      40021,
    )
  }

  const result = renewOrders(ids, years)
  return buildResponse(config, { code: 0, message: 'ok', data: result })
}

function handleBatchCancel(config) {
  const body = readBody(config)
  const ids = Array.isArray(body.ids) ? body.ids : []
  if (!ids.length) return buildErrorResponse(config, 400, '请先选择要撤单的订单', 40030)

  const result = cancelOrders(ids)
  return buildResponse(config, { code: 0, message: 'ok', data: result })
}

/* -------------------------------------------------------------------------- */
/* adapter 主体                                                                */
/* -------------------------------------------------------------------------- */

const PUBLIC_PATHS = new Set(['/auth/login'])

/** @type {import('axios').AxiosAdapter} */
export async function mockAdapter(config) {
  await delay()

  // 注意：axios 的内置 adapter 会自己把 config.params 拼到 url 上，
  // 自定义 adapter 必须手动拼接，否则筛选 / 分页参数全部丢失。
  const url = new URL(config.url || '/', MOCK_ORIGIN)
  Object.entries(config.params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.append(key, String(value))
    }
  })

  const pathname = url.pathname

  // 登录之外的所有接口都要求有效 token —— 用来验证响应拦截器的 401 分支
  if (!PUBLIC_PATHS.has(pathname)) {
    const token = readToken(config)
    if (!token.startsWith(TOKEN_PREFIX)) {
      return settle(
        buildErrorResponse(config, 401, '登录状态已失效，请重新登录', 40100),
      )
    }
  }

  const method = (config.method || 'get').toLowerCase()

  try {
    if (method === 'post' && pathname === '/auth/login') {
      return settle(handleLogin(config))
    }
    if (method === 'get' && pathname === '/orders') {
      return settle(handleOrderList(config, url))
    }
    if (method === 'get' && pathname === '/orders/exportable') {
      return settle(handleOrderExportList(config, url))
    }
    if (method === 'post' && pathname === '/orders') {
      return settle(handleCreateOrder(config))
    }
    if (method === 'post' && pathname === '/orders/batch-renew') {
      return settle(handleBatchRenew(config))
    }
    if (method === 'post' && pathname === '/orders/batch-cancel') {
      return settle(handleBatchCancel(config))
    }

    return settle(buildErrorResponse(config, 404, `模拟接口不存在: ${method.toUpperCase()} ${pathname}`, 40400))
  } catch (err) {
    if (err instanceof MockBizError) {
      return settle(buildErrorResponse(config, 400, err.message, err.code))
    }
    return settle(buildErrorResponse(config, 500, '模拟服务内部错误：' + err.message, 50000))
  }
}

export { TOKEN_PREFIX, MockBizError }