/**
 * 内存数据服务层（Mock DB）。
 *
 * 用一个模块级数组维护全量订单，提供分页查询与写操作；
 * 写操作直接改这个数组，后续查询立刻能读到变更结果。
 * 页面刷新 = 模块重新初始化 = 数据回到初始种子状态。
 */

import {
  ANNUAL_PRICE,
  CANCELLABLE_STATUSES,
  ONGOING_STATUSES,
  RENEWABLE_STATUSES,
  calcCreateAmount,
  calcRenewAmount,
  roundMoney,
} from '../constants/order'

/** 订单状态轮转，保证 36 条数据 6 种状态全覆盖且分布均匀 */
const STATUS_CYCLE = [
  'pending_review',
  'pending_card',
  'pending_ship',
  'completed',
  'expired',
  'cancelled',
]

const SURNAMES = [
  '赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈',
  '褚', '卫', '蒋', '沈', '韩', '杨', '朱', '秦', '许', '何',
  '吕', '施', '张', '孔', '曹', '严', '华', '金', '魏', '陶',
]

const GIVEN_NAMES = [
  '嘉怡', '子轩', '浩然', '雨欣', '思远', '梦琪', '宇航', '佳明', '志强', '雅雯',
  '俊杰', '欣怡', '博文', '诗涵', '天佑', '慧敏', '振宇', '若曦', '嘉豪', '静怡',
  '文博', '梓萱', '睿渊', '欣然', '明轩', '乐瑶', '皓宇', '语彤', '哲瀚', '晨曦',
]

/**
 * 线性同余伪随机数发生器。
 * 固定种子 -> 每次刷新页面拿到完全相同的初始数据，便于自测与截图对比。
 */
function createRandom(seed) {
  let state = seed >>> 0
  return function random() {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

const random = createRandom(20260901)

const pick = (arr) => arr[Math.floor(random() * arr.length)]
const randInt = (min, max) => min + Math.floor(random() * (max - min + 1))

const REMARKS = [
  '',
  '',
  '客户希望周末到店办理',
  '已确认无特殊需求',
  '老客户推荐，需额外赠送 1 个月',
  '',
  '发票抬头：公司抬头',
  '',
  '客户较关注续费价格',
  '赠品：运动毛巾一条',
  '',
  '电话预约下午 3 点后联系',
]

function pad(n, len = 2) {
  return String(n).padStart(len, '0')
}

function makePhone() {
  const prefixes = ['138', '139', '150', '151', '186', '188', '176', '199']
  let tail = ''
  for (let i = 0; i < 8; i += 1) tail += randInt(0, 9)
  return pick(prefixes) + tail
}

/** 生成初始种子数据 */
function seedOrders() {
  const now = Date.now()
  const list = []
  const usedNo = new Set()
  let orderSeq = 0

  for (let i = 0; i < 36; i += 1) {
    const status = STATUS_CYCLE[i % STATUS_CYCLE.length]
    const years = randInt(1, 5)

    // 创建时间：最近 150 天内，越靠前的记录时间越久远
    const daysAgo = 150 - Math.round((i / 36) * 148) + randInt(0, 2)
    const createdAt = new Date(
      now - daysAgo * 24 * 60 * 60 * 1000 - randInt(0, 20) * 3600 * 1000 - randInt(0, 59) * 60000,
    )

    const d = new Date(createdAt)
    const datePart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
    let orderNo = `GM${datePart}${pad(++orderSeq, 4)}`
    while (usedNo.has(orderNo)) {
      orderNo = `GM${datePart}${pad(++orderSeq, 4)}`
    }
    usedNo.add(orderNo)

    // 少量订单金额返回空值，模拟「接口偶尔返回空值」
    const amountIsNull = i % 17 === 5 || i % 23 === 11
    // 少量订单金额为 0（活动赠送卡），用于验证 0 要正常显示为 0.00 而不是空值
    const amountIsZero = !amountIsNull && (i === 3 || i % 19 === 7)

    list.push({
      id: `o_${String(i + 1).padStart(4, '0')}`,
      orderNo,
      memberName: pick(SURNAMES) + pick(GIVEN_NAMES),
      phone: makePhone(),
      years,
      amount: amountIsNull ? null : amountIsZero ? 0 : calcCreateAmount(years),
      status,
      remark: pick(REMARKS),
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      renewedYears: 0,
    })
  }

  return list
}

let orders = seedOrders()

/** 重置为初始数据（调试用，也方便 README 里说明「刷新即重置」） */
export function resetDb() {
  orders = seedOrders()
  return orders.length
}

/** 对外暴露的只读快照 */
export function getAllOrders() {
  return orders.map((o) => ({ ...o }))
}

function toDto(order) {
  // 返回副本，避免调用方直接改内存数据
  return { ...order }
}

/**
 * 分页 + 筛选查询
 * @param {object} params
 * @param {number} [params.page]        页码，从 1 开始
 * @param {number} [params.pageSize]    每页条数
 * @param {string} [params.tab]         Tab key：all / ongoing / expired / completed / cancelled
 * @param {string} [params.orderNo]     订单号，精确匹配
 * @param {string} [params.memberName]  会员姓名，模糊匹配
 * @param {string[]} [params.statuses]   直接指定状态集合（导出等场景使用）
 * @returns {{ list: object[], total: number, page: number, pageSize: number }}
 */
export function queryOrders(params = {}) {
  const {
    page = 1,
    pageSize = 10,
    tab = 'all',
    orderNo = '',
    memberName = '',
    statuses,
  } = params

  let filtered = orders.slice()

  if (Array.isArray(statuses) && statuses.length) {
    filtered = filtered.filter((o) => statuses.includes(o.status))
  } else if (tab === 'ongoing') {
    filtered = filtered.filter((o) => ONGOING_STATUSES.includes(o.status))
  } else if (tab && tab !== 'all') {
    filtered = filtered.filter((o) => o.status === tab)
  }

  if (orderNo) {
    filtered = filtered.filter((o) => o.orderNo === orderNo)
  }
  if (memberName) {
    const kw = memberName.trim().toLowerCase()
    if (kw) filtered = filtered.filter((o) => o.memberName.toLowerCase().includes(kw))
  }

  // 默认按创建时间倒序：最新创建的排在最前面
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const total = filtered.length
  const safeSize = Math.max(1, Number(pageSize) || 10)
  const safePage = Math.max(1, Number(page) || 1)
  const start = (safePage - 1) * safeSize

  return {
    list: filtered.slice(start, start + safeSize).map(toDto),
    total,
    page: safePage,
    pageSize: safeSize,
  }
}

/**
 * 查询全部命中筛选条件的数据（导出不分页）
 * 与 queryOrders 复用同一套筛选逻辑，只是不做切片。
 */
export function queryAllOrders(params = {}) {
  return queryOrders({ ...params, page: 1, pageSize: Number.MAX_SAFE_INTEGER }).list
}

/**
 * 新建订单
 * @param {{ memberName: string, phone: string, years: number, remark?: string }} payload
 */
export function createOrder(payload) {
  const now = new Date()
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const seq = orders.filter((o) => o.orderNo.startsWith(datePart)).length + 1

  const order = {
    id: `o_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    orderNo: `GM${datePart}${pad(seq, 4)}`,
    memberName: payload.memberName.trim(),
    phone: payload.phone.trim(),
    years: Number(payload.years),
    amount: calcCreateAmount(payload.years),
    status: 'pending_review',
    remark: (payload.remark || '').trim(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    renewedYears: 0,
  }

  orders.unshift(order)
  return toDto(order)
}

/** 找出不满足前置状态要求的订单 */
function partitionByStatus(ids, allowed) {
  const targets = []
  const rejected = []
  ids.forEach((id) => {
    const order = orders.find((o) => o.id === id)
    if (!order) {
      rejected.push({ id, orderNo: id, reason: '订单不存在' })
    } else if (!allowed.includes(order.status)) {
      rejected.push({ id, orderNo: order.orderNo, reason: '当前状态不允许该操作' })
    } else {
      targets.push(order)
    }
  })
  return { targets, rejected }
}

/**
 * 续卡：购卡年限累加，状态回到「待审核」
 * @param {string[]} ids
 * @param {number} years 续卡年限 1~10
 */
export function renewOrders(ids, years) {
  const { targets, rejected } = partitionByStatus(ids, RENEWABLE_STATUSES)
  const fee = calcRenewAmount(years)
  const updatedOrderNos = []

  targets.forEach((order) => {
    const base = order.amount === null || order.amount === undefined
      ? roundMoney(order.years * ANNUAL_PRICE)
      : order.amount

    order.years += Number(years)
    order.amount = roundMoney(base + fee)
    order.status = 'pending_review'
    order.renewedYears = (order.renewedYears || 0) + Number(years)
    order.updatedAt = new Date().toISOString()
    updatedOrderNos.push(order.orderNo)
  })

  return { successCount: targets.length, updatedOrderNos, rejected, feePerOrder: fee }
}

/**
 * 撤单：状态变更为「已取消」
 * @param {string[]} ids
 */
export function cancelOrders(ids) {
  const { targets, rejected } = partitionByStatus(ids, CANCELLABLE_STATUSES)
  const cancelledOrderNos = []

  targets.forEach((order) => {
    order.status = 'cancelled'
    order.updatedAt = new Date().toISOString()
    cancelledOrderNos.push(order.orderNo)
  })

  return { successCount: targets.length, cancelledOrderNos, rejected }
}