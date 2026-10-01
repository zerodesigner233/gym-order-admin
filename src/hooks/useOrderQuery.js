/**
 * 订单列表查询状态机：列表页唯一的数据来源。
 *
 * 页面里的 Tab / 页码 / 每页条数 / 搜索条件 / 刷新全部收口到这个 Hook，
 * 由它统一保证「查询条件变化 -> 回到第 1 页」，页面只负责渲染。
 */

import { useRequest } from 'ahooks'
import { useCallback, useMemo, useRef, useState } from 'react'
import { fetchOrderList } from '../api/order'
import { logUnexpectedError } from '../utils/errorLog'

const DEFAULT_TAB = 'all'
const DEFAULT_PAGE_SIZE = 10
const EMPTY_LIST = []
const EMPTY_FILTERS = { orderNo: '', memberName: '' }

/**
 * 真实错误提示由 axios 响应拦截器统一弹出，这里只负责吞掉 rejection。
 * 但不能真的什么都不做：catch 若把编程错误（TypeError、读 undefined 属性）
 * 一并吞掉，列表就会停在旧数据上且毫无痕迹。这里只上报预期外的错误。
 */
const onListError = (error) => logUnexpectedError(error, 'useOrderQuery.fetchOrderList')

/** 过滤条件归一化：去掉首尾空格，避免「 张三 」查不到「张三」 */
function normalizeFilters(filters = {}) {
  return {
    orderNo: String(filters.orderNo ?? '').trim(),
    memberName: String(filters.memberName ?? '').trim(),
  }
}

/**
 * @returns {{
 *   tab: string, page: number, pageSize: number,
 *   orderNo: string, memberName: string, filters: { orderNo: string, memberName: string },
 *   list: object[], total: number, loading: boolean,
 *   setTab: (tab: string) => void,
 *   setPage: (page: number) => void,
 *   setPageSize: (pageSize: number) => void,
 *   setFilters: (filters: object) => void,
 *   resetFilters: () => void,
 *   reload: () => void,
 * }}
 */
export default function useOrderQuery() {
  const [tab, setTabState] = useState(DEFAULT_TAB)
  const [page, setPageState] = useState(1)
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE)
  const [filters, setFiltersState] = useState(EMPTY_FILTERS)
  const [list, setList] = useState(EMPTY_LIST)
  const [total, setTotal] = useState(0)
  // 首屏请求在挂载后立刻发出，所以初始就是加载中，避免先闪一下空表
  const [loading, setLoading] = useState(true)

  /** 请求序号：只有最后一次发起的请求才有资格把结果写进 state */
  const requestSeqRef = useRef(0)

  /** 查询条件收敛成一个对象，引用变化即为「需要重新请求」的唯一信号 */
  const query = useMemo(
    () => ({ page, pageSize, tab, orderNo: filters.orderNo, memberName: filters.memberName }),
    [page, pageSize, tab, filters],
  )

  const { run, refresh } = useRequest(
    async (params) => {
      const seq = requestSeqRef.current + 1
      requestSeqRef.current = seq
      setLoading(true)
      try {
        const response = await fetchOrderList(params)

        // 乱序保护：慢响应晚到时直接丢弃，绝不覆盖更新的数据
        if (seq !== requestSeqRef.current) return { seq, dropped: true }

        const data = response?.data?.data
        const nextList = data?.list ?? EMPTY_LIST
        const nextTotal = data?.total ?? 0

        // 当前页越界（例如续卡后订单已不属于当前 Tab）：退回最后一页重新取数
        const maxPage = Math.max(1, Math.ceil(nextTotal / params.pageSize))
        if (params.page > maxPage) {
          setPageState(maxPage)
          return { seq, clamped: true }
        }

        setList(nextList)
        setTotal(nextTotal)
        return { seq }
      } finally {
        // 成功、失败都会走到这里，保证请求异常时 loading 也不会卡住
        if (seq === requestSeqRef.current) setLoading(false)
      }
    },
    {
      // 首屏请求用初始查询条件
      defaultParams: [query],
      // 查询条件（Tab / 页码 / 每页条数 / 搜索）变化时自动重跑，省掉手写 useEffect
      refreshDeps: [query],
      // refresh() 会复用上一次的参数，所以这里显式用最新条件重新发起
      refreshDepsAction: () => run(query),
      onError: onListError,
    },
  )

  const setTab = useCallback((nextTab) => {
    setTabState(nextTab)
    setPageState(1)
  }, [])

  const setPage = useCallback((nextPage) => {
    const safePage = Math.max(1, Number(nextPage) || 1)
    setPageState((current) => (current === safePage ? current : safePage))
  }, [])

  const setPageSize = useCallback((nextPageSize) => {
    const safePageSize = Number(nextPageSize) || DEFAULT_PAGE_SIZE
    setPageSizeState((current) => (current === safePageSize ? current : safePageSize))
    // 每页条数变化后旧的页码不再有意义，回到第 1 页
    setPageState(1)
  }, [])

  const setFilters = useCallback((nextFilters) => {
    setFiltersState(normalizeFilters(nextFilters))
    // 查询条件变化后旧的页码不再有意义，回到第 1 页
    setPageState(1)
  }, [])

  const resetFilters = useCallback(() => {
    setFiltersState({ ...EMPTY_FILTERS })
    setPageState(1)
  }, [])

  const reload = useCallback(() => {
    refresh()
  }, [refresh])

  const { orderNo, memberName } = filters

  // 返回值整体 memo：所有成员都是稳定引用，页面不会因为无关渲染而反复重算
  return useMemo(
    () => ({
      tab,
      page,
      pageSize,
      orderNo,
      memberName,
      filters,
      list,
      total,
      loading,
      setTab,
      setPage,
      setPageSize,
      setFilters,
      resetFilters,
      reload,
    }),
    [
      tab,
      page,
      pageSize,
      orderNo,
      memberName,
      filters,
      list,
      total,
      loading,
      setTab,
      setPage,
      setPageSize,
      setFilters,
      resetFilters,
      reload,
    ],
  )
}
