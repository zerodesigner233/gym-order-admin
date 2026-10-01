/**
 * 导出 CSV 按钮（Part 5）。
 *
 * 导出范围 = 当前筛选条件下的全部订单（不分页），再按 EXPORTABLE_STATUSES
 * 过滤掉「待审核 / 已取消」，并把被排除的订单号明确告知用户。
 */

import { DownloadOutlined } from '@ant-design/icons'
import { App, Button } from 'antd'
import { useState } from 'react'
import { fetchAllOrdersForExport } from '../../../api/order'
import { EXPORTABLE_STATUSES, ORDER_STATUS_LABEL, formatDateTime } from '../../../constants/order'
import { buildCsvFilename, exportToCsv } from '../../../utils/csv'
import { logUnexpectedError } from '../../../utils/errorLog'
import { formatMoney, isBlank } from '../../../utils/money'

const EXPORT_COLUMNS = [
  { title: '订单号', dataIndex: 'orderNo' },
  { title: '会员姓名', dataIndex: 'memberName' },
  { title: '联系手机号', dataIndex: 'phone' },
  { title: '购卡年限', dataIndex: 'yearsText' },
  { title: '订单金额', dataIndex: 'amountText' },
  { title: '订单状态', dataIndex: 'statusText' },
  { title: '创建时间', dataIndex: 'createdAtText' },
  { title: '备注', dataIndex: 'remark' },
]

/** 金额为空时写空单元格：不要把占位符 - 或 0.00 带进对账表 */
function toExportRow(order) {
  return {
    orderNo: order.orderNo,
    memberName: order.memberName,
    phone: order.phone,
    yearsText: `${order.years} 年`,
    amountText: isBlank(order.amount) ? '' : formatMoney(order.amount),
    statusText: ORDER_STATUS_LABEL[order.status] || order.status,
    createdAtText: formatDateTime(order.createdAt),
    remark: order.remark || '',
  }
}

/**
 * 单次导出上限。
 * 浏览器一次性生成超大 CSV 会长时间阻塞主线程，超过阈值时让用户先缩小筛选范围。
 * 真正的超大规模导出应改由后端异步生成（见 README 假设 A10 / 已知限制 8.1 L2）。
 */
const MAX_EXPORT_ROWS = 5000

/**
 * 提示里最多列出多少个被排除的订单号。
 * 需求只要求「提示中需列出订单号」，不要求全量列出；全量拼接在命中几百条时不可读。
 */
const EXCLUDED_PREVIEW = 8

export default function ExportButton({ tab, filters, tabLabel }) {
  const { message } = App.useApp()
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const response = await fetchAllOrdersForExport({
        tab,
        orderNo: filters?.orderNo,
        memberName: filters?.memberName,
      })

      const allRows = response?.data?.data?.list ?? []
      const exportable = allRows.filter((order) => EXPORTABLE_STATUSES.includes(order.status))
      const excluded = allRows.filter((order) => !EXPORTABLE_STATUSES.includes(order.status))

      if (!exportable.length) {
        message.error('当前筛选结果中没有可导出的订单（仅待制卡 / 待寄卡 / 已完成 / 已到期可导出）')
        return
      }

      // 排除清单必须限量：命中几百条时把订单号全量拼进提示会变成不可读的长文本
      const excludedHint = excluded.length
        ? `已跳过 ${excluded.length} 笔不可导出的订单（待审核 / 已取消）：` +
          excluded
            .slice(0, EXCLUDED_PREVIEW)
            .map((order) => order.orderNo)
            .join('、') +
          (excluded.length > EXCLUDED_PREVIEW
            ? ` 等 ${excluded.length} 笔（完整清单请缩小筛选范围后查看）`
            : '')
        : ''

      if (exportable.length > MAX_EXPORT_ROWS) {
        // 超限时也要说明排除了什么，否则用户只看到「超限」却不知道口径
        message.error(
          `命中 ${exportable.length} 条可导出订单，超过单次导出上限 ${MAX_EXPORT_ROWS} 条，` +
            `请缩小筛选范围后重试${excludedHint ? `；${excludedHint}` : ''}`,
        )
        return
      }

      if (excludedHint) {
        message.warning(excludedHint)
      }

      const rows = exportable.map(toExportRow)
      exportToCsv({
        filename: buildCsvFilename(`订单导出_${tabLabel}`),
        columns: EXPORT_COLUMNS,
        rows,
      })
      message.success(`已导出 ${rows.length} 条订单记录`)
    } catch (error) {
      // 请求失败由 axios 响应拦截器统一提示，这里不重复弹窗
      logUnexpectedError(error, 'ExportButton.handleExport')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
      导出 CSV
    </Button>
  )
}
