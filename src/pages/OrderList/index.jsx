import {
  ClearOutlined,
  ExclamationCircleFilled,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Empty,
  Flex,
  Form,
  Input,
  Pagination,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { batchCancelOrders, batchRenewOrders } from '../../api/order'
import {
  CANCELLABLE_STATUSES,
  ORDER_STATUS_COLOR,
  ORDER_STATUS_LABEL,
  ORDER_TABS,
  RENEWABLE_STATUSES,
  formatDateTime,
} from '../../constants/order'
import useOrderQuery from '../../hooks/useOrderQuery'
import {
  selectHasSelected,
  selectSelectedCount,
  selectSelectedIds,
  selectSelectedRows,
  useOrderSelectionStore,
} from '../../stores/orderSelectionStore'
import { logUnexpectedError } from '../../utils/errorLog'
import { formatMoney, toMoneyCell } from '../../utils/money'
import ExportButton from './components/ExportButton'
import RenewModal from './components/RenewModal'

const SELECT_HINT = '请先勾选需要操作的订单'

/** 按状态把选中的订单拆成「可操作」与「不可操作」两组 */
function splitByStatus(orders, allowedStatuses) {
  const eligible = []
  const ineligible = []
  orders.forEach((order) => {
    if (allowedStatuses.includes(order.status)) eligible.push(order)
    else ineligible.push(order)
  })
  return { eligible, ineligible }
}

function orderNoText(orders) {
  return orders.map((order) => order?.orderNo ?? order).join('、')
}

export default function OrderList() {
  // 必须用 App.useApp()：静态 message / Modal.confirm 会丢失 ConfigProvider 主题上下文
  const { message, modal } = App.useApp()
  const [form] = Form.useForm()
  const [renewState, setRenewState] = useState({ open: false, orders: [], skippedOrders: [] })
  const [renewing, setRenewing] = useState(false)

  const {
    tab,
    page,
    pageSize,
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
  } = useOrderQuery()

  // selectedIds / selectedRows 每次都是新数组，套一层浅比较避免无意义的重复渲染
  const selectedIds = useOrderSelectionStore(useShallow(selectSelectedIds))
  const selectedRows = useOrderSelectionStore(useShallow(selectSelectedRows))
  const selectedCount = useOrderSelectionStore(selectSelectedCount)
  const hasSelected = useOrderSelectionStore(selectHasSelected)
  const syncVisibleRows = useOrderSelectionStore((state) => state.syncVisibleRows)
  const addRows = useOrderSelectionStore((state) => state.addRows)
  const removeRows = useOrderSelectionStore((state) => state.removeRows)
  const toggleRow = useOrderSelectionStore((state) => state.toggleRow)
  const clearSelection = useOrderSelectionStore((state) => state.clear)

  // 每次列表刷新后同步已选中的订单对象，保证跨页选择在确认弹窗里能拿到最新订单号
  useEffect(() => {
    if (list.length) syncVisibleRows(list)
  }, [list, syncVisibleRows])

  const closeRenewModal = useCallback(() => {
    setRenewState({ open: false, orders: [], skippedOrders: [] })
  }, [])

  const openRenewModal = useCallback((orders, skippedOrders) => {
    setRenewState({ open: true, orders, skippedOrders })
  }, [])

  /** 行内续卡：与批量续卡共用弹窗和提交逻辑 */
  const handleRowRenew = useCallback(
    (record) => {
      openRenewModal([record], [])
    },
    [openRenewModal],
  )

  const columns = useMemo(
    () => [
      {
        title: '订单号',
        dataIndex: 'orderNo',
        width: 168,
        fixed: 'left',
        render: (value) => <span className="mono-cell">{value}</span>,
      },
      { title: '会员姓名', dataIndex: 'memberName', width: 108 },
      {
        title: '购卡年限',
        dataIndex: 'years',
        width: 96,
        align: 'center',
        render: (value) => `${value} 年`,
      },
      {
        title: '订单金额',
        dataIndex: 'amount',
        width: 132,
        align: 'right',
        // 只对当前页做金额排序；不给 defaultSortOrder，默认顺序保持服务端的「创建时间倒序」
        sorter: (a, b) => toMoneyCell(a.amount).value - toMoneyCell(b.amount).value,
        render: (value) => <span className="amount-cell">{formatMoney(value)}</span>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 96,
        render: (status) => (
          <Tag color={ORDER_STATUS_COLOR[status]}>{ORDER_STATUS_LABEL[status] || '-'}</Tag>
        ),
      },
      // 服务端默认按创建时间倒序返回（最新在前），这里刻意不提供前端排序以免与之冲突
      {
        title: '创建时间',
        dataIndex: 'createdAt',
        width: 148,
        render: (value) => formatDateTime(value),
      },
      {
        title: '操作',
        key: 'action',
        width: 88,
        fixed: 'right',
        render: (_value, record) =>
          RENEWABLE_STATUSES.includes(record.status) ? (
            <Button type="link" size="small" onClick={() => handleRowRenew(record)}>
              续卡
            </Button>
          ) : null,
      },
    ],
    [handleRowRenew],
  )

  const tabItems = useMemo(
    () => ORDER_TABS.map((item) => ({ key: item.key, label: item.label })),
    [],
  )

  const activeTabLabel = useMemo(
    () => ORDER_TABS.find((item) => item.key === tab)?.label ?? '全部',
    [tab],
  )

  const rowSelection = useMemo(
    () => ({
      selectedRowKeys: selectedIds,
      // 单选：onSelect(record, selected) 与 store 的 toggleRow(row, checked) 签名一致
      onSelect: toggleRow,
      // 全选只增删「本次变化的行」，因此翻页后其它页的勾选不会丢
      onSelectAll: (selected, _selectedRows, changeRows) => {
        if (selected) addRows(changeRows)
        else removeRows(changeRows.map((row) => row.id))
      },
      preserveSelectedRowKeys: true,
      columnWidth: 44,
    }),
    [selectedIds, toggleRow, addRows, removeRows],
  )

  /* ------------------------------- 交互 ------------------------------- */

  const handleTabChange = (nextTab) => {
    setTab(nextTab)
    // 筛选维度变了，已勾选的订单在新结果集里可能已不可见
    clearSelection()
  }

  const handleSearch = (values) => {
    setFilters(values)
    clearSelection()
  }

  const handleReset = () => {
    form.resetFields()
    resetFilters()
    clearSelection()
  }

  const handleBatchRenew = () => {
    const { eligible, ineligible } = splitByStatus(selectedRows, RENEWABLE_STATUSES)
    if (!eligible.length) {
      modal.warning({
        title: '没有可续卡的订单',
        content: (
          <div>
            仅「已到期」的订单可以续卡，已跳过 {ineligible.length} 笔不可续卡的订单：
            <div className="mono-cell" style={{ wordBreak: 'break-all' }}>
              {orderNoText(ineligible)}
            </div>
          </div>
        ),
        okText: '知道了',
      })
      return
    }
    // 不可续卡的订单会在弹窗内以 Alert 明确列出，只对 eligible 发起续卡
    openRenewModal(eligible, ineligible)
  }

  const handleRenewSubmit = async (years) => {
    const ids = renewState.orders.map((order) => order.id)
    setRenewing(true)
    try {
      const response = await batchRenewOrders({ ids, years })
      const result = response?.data?.data
      const rejected = result?.rejected ?? []

      // 服务端对状态不合法的订单是 HTTP 200 + rejected，必须自己判断，不能靠抛错
      if (rejected.length) {
        modal.warning({
          title: '部分订单续卡未成功',
          content: (
            <div>
              以下订单未通过服务端校验（状态可能已变化）：
              <div className="mono-cell" style={{ wordBreak: 'break-all' }}>
                {orderNoText(rejected)}
              </div>
            </div>
          ),
          okText: '知道了',
        })
      }

      message.success(
        `续卡成功 ${result?.successCount ?? 0} 笔，每笔 ¥${formatMoney(result?.feePerOrder)}`,
      )
      closeRenewModal()
      clearSelection()
      // 续卡后订单会离开「已到期」Tab，必须重新拉列表（页码越界由 useOrderQuery 兜底）
      reload()
    } catch (error) {
      // 请求失败由 axios 响应拦截器统一提示，这里不再重复提示，保留弹窗方便重试
      logUnexpectedError(error, 'OrderList.handleBatchRenew')
    } finally {
      setRenewing(false)
    }
  }

  const doCancelOrders = async (orders) => {
    try {
      const response = await batchCancelOrders({ ids: orders.map((order) => order.id) })
      const result = response?.data?.data
      const rejected = result?.rejected ?? []

      if (rejected.length) {
        modal.warning({
          title: '部分订单撤单未成功',
          content: (
            <div>
              以下订单未通过服务端校验（状态可能已变化）：
              <div className="mono-cell" style={{ wordBreak: 'break-all' }}>
                {orderNoText(rejected)}
              </div>
            </div>
          ),
          okText: '知道了',
        })
      }

      message.success(`撤单成功 ${result?.successCount ?? 0} 笔`)
      clearSelection()
      reload()
    } catch (error) {
      // 请求失败由 axios 响应拦截器统一提示，confirm 弹窗会自动关闭
      logUnexpectedError(error, 'OrderList.handleBatchCancel')
    }
  }

  const handleBatchCancel = () => {
    const { eligible, ineligible } = splitByStatus(selectedRows, CANCELLABLE_STATUSES)
    if (!eligible.length) {
      modal.warning({
        title: '没有可撤单的订单',
        content: (
          <div>
            仅「待制卡 / 待寄卡」的订单可以撤单，以下 {ineligible.length} 笔订单均不满足条件：
            <div className="mono-cell" style={{ wordBreak: 'break-all' }}>
              {orderNoText(ineligible)}
            </div>
          </div>
        ),
        okText: '知道了',
      })
      return
    }

    // 二次确认：必须显式点击「确认撤单」才会真正执行
    modal.confirm({
      title: `确认撤单 ${eligible.length} 笔订单？`,
      icon: <ExclamationCircleFilled />,
      width: 520,
      okText: '确认撤单',
      okButtonProps: { danger: true },
      cancelText: '再想想',
      content: (
        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 8 }}>
          <div>
            <Typography.Text type="secondary">以下订单将被取消，且无法恢复：</Typography.Text>
            <div className="mono-cell" style={{ wordBreak: 'break-all' }}>
              {orderNoText(eligible)}
            </div>
          </div>
          {ineligible.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={`已跳过 ${ineligible.length} 笔不可撤单的订单`}
              description={
                <div>
                  <Typography.Text type="secondary">
                    仅「待制卡 / 待寄卡」的订单可以撤单，以下订单需单独处理：
                  </Typography.Text>
                  <div className="mono-cell" style={{ wordBreak: 'break-all' }}>
                    {orderNoText(ineligible)}
                  </div>
                </div>
              }
            />
          )}
        </Space>
      ),
      onOk: () => doCancelOrders(eligible),
    })
  }

  /* ------------------------------- 渲染 ------------------------------- */

  return (
    <div>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 4 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          办卡订单
        </Typography.Title>
        <Typography.Text type="secondary">共 {total} 笔</Typography.Text>
      </Flex>

      <Tabs activeKey={tab} items={tabItems} onChange={handleTabChange} />

      <Form form={form} layout="inline" onFinish={handleSearch}>
        <Form.Item name="orderNo" label="订单号">
          <Input allowClear placeholder="精确匹配，如 GM202609010001" style={{ width: 220 }} />
        </Form.Item>
        <Form.Item name="memberName" label="会员姓名">
          <Input allowClear placeholder="模糊匹配，如 张" style={{ width: 180 }} />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              查询
            </Button>
            <Button onClick={handleReset}>重置</Button>
          </Space>
        </Form.Item>
      </Form>

      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 12 }}>
        <Space wrap>
          <Tooltip title={hasSelected ? '' : SELECT_HINT}>
            <span>
              <Button
                type="primary"
                icon={<SyncOutlined />}
                disabled={!hasSelected}
                onClick={handleBatchRenew}
              >
                续卡
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={hasSelected ? '' : SELECT_HINT}>
            <span>
              <Button
                danger
                icon={<StopOutlined />}
                disabled={!hasSelected}
                onClick={handleBatchCancel}
              >
                撤单
              </Button>
            </span>
          </Tooltip>
          <ExportButton tab={tab} filters={filters} tabLabel={activeTabLabel} />
          <Button icon={<ReloadOutlined />} onClick={reload}>
            刷新
          </Button>
        </Space>

        <Space size={8} wrap>
          <Tooltip title="勾选状态跨页保留：翻页、切换每页条数都不会丢失，切换 Tab 或点击「重置」会清空">
            <Typography.Text type="secondary">已选 {selectedCount} 项</Typography.Text>
          </Tooltip>
          <Button
            size="small"
            type="link"
            icon={<ClearOutlined />}
            disabled={!hasSelected}
            onClick={clearSelection}
          >
            清空选择
          </Button>
        </Space>
      </Flex>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={list}
        loading={loading}
        // 分页由页面自己渲染：Tab / 搜索需要联动重置页码
        pagination={false}
        rowSelection={rowSelection}
        scroll={{ x: 936 }}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的订单" />
          ),
        }}
      />

      <Flex justify="flex-end" style={{ marginTop: 16 }}>
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          pageSizeOptions={[10, 20, 50]}
          showTotal={(count, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${count} 条`}
          onChange={(nextPage, nextSize) => {
            // 每页条数变化时 rc-pagination 会先算出一个补偿页码再触发 onChange，
            // 这里忽略它，统一由 onShowSizeChange 回到第 1 页
            if (nextSize !== pageSize) return
            setPage(nextPage)
          }}
          onShowSizeChange={(_nextPage, nextSize) => setPageSize(nextSize)}
        />
      </Flex>

      <RenewModal
        open={renewState.open}
        orders={renewState.orders}
        skippedOrders={renewState.skippedOrders}
        confirmLoading={renewing}
        onCancel={closeRenewModal}
        onSubmit={handleRenewSubmit}
      />
    </div>
  )
}
