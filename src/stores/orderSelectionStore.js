/**
 * 订单勾选状态（跨页保留，Part 5 加分项）。
 *
 * 不直接存 rowKeys 数组，而是存 `{ [id]: order }` 的 Map：
 *  1. 跨页保留时，需要拿到「不在当前页」的订单对象才能在确认弹窗里列出订单号；
 *  2. 用对象做键天然去重，翻页/重新查询都不会丢选择；
 *  3. 翻页时用 syncVisibleRows 把新一页的数据合并进来，旧数据保持不动。
 *
 * 注意：切换筛选 Tab / 手动点「取消选择」时才清空 —— 因为筛选条件变了，
 * 原来的选择在新的结果集里可能已经失去意义。
 */

import { create } from 'zustand'

function toMap(rows) {
  const map = {}
  rows.forEach((row) => {
    if (row?.id) map[row.id] = row
  })
  return map
}

export const useOrderSelectionStore = create((set) => ({
  /** @type {Record<string, object>} */
  selectedMap: {},

  /** 把当前页可见的行合并进缓存；已选中的行刷新为最新数据 */
  syncVisibleRows: (rows) =>
    set((state) => {
      const next = { ...state.selectedMap }
      rows.forEach((row) => {
        if (row?.id && next[row.id]) next[row.id] = row
      })
      return { selectedMap: next }
    }),

  /** 全选当前页（保留其它页的选择） */
  addRows: (rows) => set((state) => ({ selectedMap: { ...state.selectedMap, ...toMap(rows) } })),

  /** 取消勾选 */
  removeRows: (ids) =>
    set((state) => {
      const next = { ...state.selectedMap }
      ids.forEach((id) => delete next[id])
      return { selectedMap: next }
    }),

  /** 单条切换 */
  toggleRow: (row, checked) =>
    set((state) => {
      const next = { ...state.selectedMap }
      if (checked) next[row.id] = row
      else delete next[row.id]
      return { selectedMap: next }
    }),

  /** 清空全部选择 */
  clear: () => set({ selectedMap: {} }),
}))

/* ------------------------------ selectors -------------------------------- */

export const selectSelectedIds = (state) => Object.keys(state.selectedMap)

export const selectSelectedRows = (state) => Object.values(state.selectedMap)

export const selectSelectedCount = (state) => Object.keys(state.selectedMap).length

export const selectHasSelected = (state) => Object.keys(state.selectedMap).length > 0
