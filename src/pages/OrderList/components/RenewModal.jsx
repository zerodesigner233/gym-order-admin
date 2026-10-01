/**
 * 续卡弹窗：批量续卡（F7）与行内续卡（F9）共用同一份表单与费用试算逻辑。
 */

import { Alert, Divider, Flex, Form, InputNumber, Modal, Space, Tag, Typography, theme } from 'antd'
import { useEffect, useState } from 'react'
import {
  ANNUAL_PRICE,
  MAX_YEARS,
  MIN_YEARS,
  RENEW_DISCOUNT_RATE,
  RENEW_DISCOUNT_YEARS,
  calcCreateAmount,
  calcRenewAmount,
  hasRenewDiscount,
  roundMoney,
} from '../../../constants/order'
import { logUnexpectedError } from '../../../utils/errorLog'
import { formatMoney } from '../../../utils/money'

const { Text } = Typography

function orderNoText(orders) {
  return orders.map((order) => order?.orderNo ?? order).join('、')
}

export default function RenewModal({
  open,
  orders,
  skippedOrders = [],
  confirmLoading,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()
  const { token } = theme.useToken()
  const [years, setYears] = useState(MIN_YEARS)

  // 每次打开都重置为最短续卡年限，避免上一次的选择被悄悄沿用
  useEffect(() => {
    if (!open) return
    setYears(MIN_YEARS)
    form.setFieldsValue({ years: MIN_YEARS })
  }, [open, form])

  const feePerOrder = calcRenewAmount(years)
  const grossPerOrder = calcCreateAmount(years)
  const discounted = hasRenewDiscount(years)
  const total = roundMoney(feePerOrder * orders.length)

  const handleOk = async () => {
    // 校验与提交刻意分成两段。validateFields 失败时抛出的是 { errorFields } 普通对象
    // 而不是 Error，若和提交失败共用一个 catch，会被 logUnexpectedError 误判成
    // 「预期外的错误」写进控制台，污染端到端用例的 0 console error 断言。
    const values = await form.validateFields().catch(() => null)
    if (!values) return

    try {
      await onSubmit(values.years)
    } catch (error) {
      // 请求失败由 axios 响应拦截器统一提示，这里不再重复提示，保留弹窗方便用户修改后重试
      logUnexpectedError(error, 'RenewModal.handleOk')
    }
  }

  return (
    <Modal
      open={open}
      title={orders.length > 1 ? `批量续卡（${orders.length} 笔）` : '续卡'}
      width={560}
      forceRender
      maskClosable={false}
      okText="确认续卡"
      cancelText="取消"
      confirmLoading={confirmLoading}
      onOk={handleOk}
      onCancel={onCancel}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {skippedOrders.length > 0 && (
          <Alert
            type="warning"
            showIcon
            message={`已跳过 ${skippedOrders.length} 笔不可续卡的订单`}
            description={
              <div>
                <Text type="secondary">仅「已到期」的订单可以续卡，以下订单需单独处理：</Text>
                <div className="mono-cell" style={{ wordBreak: 'break-all' }}>
                  {orderNoText(skippedOrders)}
                </div>
              </div>
            }
          />
        )}

        <div>
          <Text type="secondary">本次续卡订单（{orders.length} 笔）</Text>
          <div className="mono-cell" style={{ wordBreak: 'break-all' }}>
            {orderNoText(orders)}
          </div>
        </div>

        <Form
          form={form}
          layout="vertical"
          initialValues={{ years: MIN_YEARS }}
          onValuesChange={(changed) => {
            if ('years' in changed) setYears(changed.years)
          }}
        >
          <Form.Item
            name="years"
            label="续卡年限"
            style={{ marginBottom: 12 }}
            rules={[{ required: true, message: '请选择续卡年限' }]}
          >
            <InputNumber
              min={MIN_YEARS}
              max={MAX_YEARS}
              precision={0}
              step={1}
              suffix="年"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>

        <div
          style={{
            background: token.colorFillQuaternary,
            borderRadius: token.borderRadiusLG,
            padding: 12,
          }}
        >
          <Flex vertical gap={4}>
            <Flex justify="space-between" align="baseline" gap={12}>
              <Text type="secondary">
                原价（{years} 年 × ¥{ANNUAL_PRICE}）
              </Text>
              <Text type={discounted ? 'secondary' : undefined} delete={discounted}>
                ¥{formatMoney(grossPerOrder)}
              </Text>
            </Flex>

            {discounted && (
              <Flex justify="space-between" align="center" gap={12}>
                <Space size={4}>
                  <Text type="secondary">续卡折扣</Text>
                  <Tag color="magenta" style={{ marginInlineEnd: 0 }}>
                    满 {RENEW_DISCOUNT_YEARS} 年享 {RENEW_DISCOUNT_RATE * 10} 折
                  </Tag>
                </Space>
                <Text type="secondary">
                  已优惠 ¥{formatMoney(roundMoney(grossPerOrder - feePerOrder))}
                </Text>
              </Flex>
            )}

            <Flex justify="space-between" align="baseline" gap={12}>
              <Text strong>应付费用（每笔）</Text>
              <Text strong style={{ color: token.colorPrimary, fontSize: token.fontSizeLG }}>
                ¥{formatMoney(feePerOrder)}
              </Text>
            </Flex>

            <Divider style={{ margin: '4px 0' }} />

            <Flex justify="space-between" align="baseline" gap={12}>
              <Text type="secondary">
                续卡 {orders.length} 笔，每笔 ¥{formatMoney(feePerOrder)}
              </Text>
              <Text strong>合计 ¥{formatMoney(total)}</Text>
            </Flex>
          </Flex>
        </div>
      </Space>
    </Modal>
  )
}
