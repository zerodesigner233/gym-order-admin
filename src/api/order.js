import request from './request'

/**
 * 分页查询订单列表
 * @param {{ page: number, pageSize: number, tab: string, orderNo?: string, memberName?: string }} params
 */
export function fetchOrderList(params) {
  return request.get('/orders', { params })
}

/**
 * 查询当前筛选条件下的全部订单（不分页），用于导出 CSV
 * 与列表接口共用同一套筛选参数，保证「导出的就是当前看到的筛选结果」
 */
export function fetchAllOrdersForExport(params) {
  return request.get('/orders/exportable', { params })
}

/** 新建订单 */
export function createOrder(payload) {
  return request.post('/orders', payload)
}

/** 批量续卡 */
export function batchRenewOrders({ ids, years }) {
  return request.post('/orders/batch-renew', { ids, years })
}

/** 批量撤单 */
export function batchCancelOrders({ ids }) {
  return request.post('/orders/batch-cancel', { ids })
}
