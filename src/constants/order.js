/**
 * 订单相关的领域常量：状态、标签页映射、定价规则。
 * 集中放在一处，避免状态字面量散落在各个组件里。
 */

import { isBlank } from '../utils/money'

/** 订单状态枚举（与后端约定的 code） */
export const OrderStatus = {
  /** 待审核 */
  PENDING_REVIEW: 'pending_review',
  /** 待制卡 */
  PENDING_CARD: 'pending_card',
  /** 待寄卡 */
  PENDING_SHIP: 'pending_ship',
  /** 已完成 */
  COMPLETED: 'completed',
  /** 已到期 */
  EXPIRED: 'expired',
  /** 已取消 */
  CANCELLED: 'cancelled',
}

/** 状态 -> 中文文案 */
export const ORDER_STATUS_LABEL = {
  [OrderStatus.PENDING_REVIEW]: '待审核',
  [OrderStatus.PENDING_CARD]: '待制卡',
  [OrderStatus.PENDING_SHIP]: '待寄卡',
  [OrderStatus.COMPLETED]: '已完成',
  [OrderStatus.EXPIRED]: '已到期',
  [OrderStatus.CANCELLED]: '已取消',
}

/** 状态 -> antd Tag 颜色 */
export const ORDER_STATUS_COLOR = {
  [OrderStatus.PENDING_REVIEW]: 'gold',
  [OrderStatus.PENDING_CARD]: 'blue',
  [OrderStatus.PENDING_SHIP]: 'cyan',
  [OrderStatus.COMPLETED]: 'green',
  [OrderStatus.EXPIRED]: 'volcano',
  [OrderStatus.CANCELLED]: 'default',
}

/** 「进行中」= 待审核 + 待制卡 + 待寄卡 */
export const ONGOING_STATUSES = [
  OrderStatus.PENDING_REVIEW,
  OrderStatus.PENDING_CARD,
  OrderStatus.PENDING_SHIP,
]

/** 只有这些状态允许续卡 */
export const RENEWABLE_STATUSES = [OrderStatus.EXPIRED]

/** 只有这些状态允许撤单 */
export const CANCELLABLE_STATUSES = [OrderStatus.PENDING_CARD, OrderStatus.PENDING_SHIP]

/** 列表页 Tab 定义；key 为前端概念，statuses 为对应的后端状态集合 */
export const ORDER_TABS = [
  { key: 'all', label: '全部', statuses: Object.values(OrderStatus) },
  { key: 'ongoing', label: '进行中', statuses: ONGOING_STATUSES },
  { key: 'expired', label: '已到期', statuses: [OrderStatus.EXPIRED] },
  { key: 'completed', label: '已完成', statuses: [OrderStatus.COMPLETED] },
  { key: 'cancelled', label: '已取消', statuses: [OrderStatus.CANCELLED] },
]

/** Part 5：允许导出 CSV 对账的状态（假设见 README） */
export const EXPORTABLE_STATUSES = [
  OrderStatus.PENDING_CARD,
  OrderStatus.PENDING_SHIP,
  OrderStatus.COMPLETED,
  OrderStatus.EXPIRED,
]

/* -------------------------------------------------------------------------- */
/* 定价规则                                                                     */
/* -------------------------------------------------------------------------- */

/** 办卡单价：1200 元 / 年 */
export const ANNUAL_PRICE = 1200

/** 续卡满该年限（>=）享受 8 折 */
export const RENEW_DISCOUNT_YEARS = 5

/** 续卡折扣率 */
export const RENEW_DISCOUNT_RATE = 0.8

/** 购卡年限 / 续卡年限的取值范围 */
export const MIN_YEARS = 1
export const MAX_YEARS = 10

/** 新建订单费用：年限 × 1200（无折扣） */
export function calcCreateAmount(years) {
  // 必须先判空再 Number()：Number(null) 和 Number('') 都等于 0，
  // 只靠 isFinite 守卫会把「年限未填」当成「0 年」，让费用显示成 ¥0.00
  // 而非「未知」（同 README 4.2 记录的 null 与 0 那个坑）。
  if (isBlank(years)) return null
  const n = Number(years)
  if (!Number.isFinite(n)) return null
  return roundMoney(n * ANNUAL_PRICE)
}

/** 是否命中续卡折扣 */
export function hasRenewDiscount(years) {
  const n = Number(years)
  return Number.isFinite(n) && n >= RENEW_DISCOUNT_YEARS
}

/** 续卡费用：年限 × 1200；满 5 年按 8 折 */
export function calcRenewAmount(years) {
  if (isBlank(years)) return null
  const n = Number(years)
  if (!Number.isFinite(n)) return null
  const gross = n * ANNUAL_PRICE
  return roundMoney(hasRenewDiscount(n) ? gross * RENEW_DISCOUNT_RATE : gross)
}

/** 金额四舍五入到分，避免浮点误差（如 6720.000000000001） */
export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

/** 格式化时间：2026-09-01 14:30 */
export function formatDateTime(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  const p = (x) => String(x).padStart(2, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}`
  )
}
