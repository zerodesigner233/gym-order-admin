/**
 * CSV 导出工具（浏览器端，无后端配合）。
 *
 * 处理了三个容易出错的点：
 * 1. 中文乱码 —— 写入 UTF-8 BOM，Excel 双击打开才不乱码
 * 2. 单元格转义 —— 含逗号 / 引号 / 换行 / 空格的值要加双引号并转义内部引号
 * 3. CSV 公式注入 —— 以 = + - @ 开头的字符串会被 Excel 当公式执行，加前缀单引号阻断
 */

const BOM = '\uFEFF'
const CRLF = '\r\n'
/** Excel / WPS 会直接执行的公式前缀 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/

/**
 * 单元格转义
 * @param {unknown} value
 * @param {{ guardFormula?: boolean }} [options]
 */
function escapeCell(value, options = {}) {
  const { guardFormula = true } = options

  let str = value === null || value === undefined ? '' : String(value)

  if (guardFormula && typeof value === 'string' && FORMULA_PREFIX.test(str)) {
    // 前置单引号让 Excel 把它当纯文本
    str = `'${str}`
  }

  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * 生成 CSV 文本
 * @param {{ title: string, dataIndex: string }[]} columns 列定义
 * @param {Record<string, unknown>[]} rows 数据行
 * @param {{ guardFormula?: boolean }} [options]
 * @returns {string}
 */
export function buildCsv(columns, rows, options = {}) {
  const header = columns.map((c) => escapeCell(c.title, options)).join(',')
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(row[c.dataIndex], options)).join(','),
  )
  return BOM + [header, ...body].join(CRLF) + CRLF
}

/**
 * 生成文件名：`订单导出_20260901_143022.csv`
 * @param {string} base 文件名主体
 * @param {Date} [now]
 */
export function buildCsvFilename(base, now = new Date()) {
  const p = (x) => String(x).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_` +
    `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return `${base}_${stamp}.csv`
}

/**
 * 触发浏览器下载 CSV
 * @param {string} filename
 * @param {string} csvText
 */
export function downloadCsvFile(filename, csvText) {
  // 带 BOM 的 application/vnd.ms-excel 让 Excel 识别编码并触发下载而不是直接渲染
  const blob = new Blob([csvText], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // 立刻 revoke 在部分浏览器会中断下载，延迟释放更稳
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 一步导出：列定义 + 行数据 -> 下载
 * @param {{ filename: string, columns: {title: string, dataIndex: string}[], rows: Record<string, unknown>[] }} params
 */
export function exportToCsv({ filename, columns, rows, ...options }) {
  if (!rows.length) {
    throw new Error('没有可导出的数据')
  }
  downloadCsvFile(filename, buildCsv(columns, rows, options))
  return rows.length
}