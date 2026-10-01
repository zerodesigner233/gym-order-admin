/**
 * 金额格式化。
 *
 * 需求要点：
 * 1. 按千分位展示，如 12,000.00
 * 2. 费用为 0 的订单要正常展示为 0.00（不能被误判为空值）
 * 3. 接口可能返回 null / undefined / '' / 非法数字
 *
 * 注意：Number(null) === 0、Number('') === 0，所以必须先显式判空，
 * 否则空值会被显示成 0.00 —— 这是本模块最容易踩的坑。
 */

const PLACEHOLDER = '-'

/**
 * @param {number|string|null|undefined} value 原始金额
 * @param {object} [options]
 * @param {string} [options.placeholder] 空值占位符
 * @param {string} [options.emptyAsZero] 传 'true' 时把空值当作 0（对账场景有用）
 * @returns {string}
 */
export function formatMoney(value, options = {}) {
  const { placeholder = PLACEHOLDER, emptyAsZero } = options

  if (isBlank(value)) {
    return emptyAsZero === 'true' ? (0).toFixed(2) : placeholder
  }

  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return placeholder

  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** 是否为空值（0 与 '0' 都视为有值） */
export function isBlank(value) {
  return value === null || value === undefined || value === '' || Number.isNaN(value)
}

/**
 * 给表格用的元单位包装，用于列排序时的数值对齐。
 * @returns {{ text: string, value: number }}
 */
export function toMoneyCell(value, options = {}) {
  return { text: formatMoney(value, options), value: isBlank(value) ? -Infinity : Number(value) }
}

/** 解析金额字符串为 number，失败返回 null */
export function parseMoney(value) {
  if (isBlank(value)) return null
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}
