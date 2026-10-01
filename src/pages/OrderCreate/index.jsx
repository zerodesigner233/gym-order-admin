import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { App, Button, Form, Input, InputNumber, Space, Typography, theme } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createOrder } from '../../api/order'
import { ANNUAL_PRICE, MAX_YEARS, MIN_YEARS, calcCreateAmount } from '../../constants/order'
import { formatMoney } from '../../utils/money'

/** 中国大陆手机号 */
const PHONE_RE = /^1[3-9]\d{9}$/

/** 空值交给 required 规则报错，避免同一个字段弹出两条错误 */
const isBlankValue = (value) => value === null || value === undefined || value === ''

export default function OrderCreate() {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const { message } = App.useApp()
  const t = theme.useToken()

  /** 办卡费用随年限实时联动（金额由后端计算，这里只做展示） */
  const years = Form.useWatch('years', form)
  const amountText = formatMoney(calcCreateAmount(years), { placeholder: '0.00' })

  const handleFinish = async (values) => {
    if (submitting) return
    setSubmitting(true)
    try {
      await createOrder({
        memberName: String(values.memberName).trim(),
        phone: String(values.phone).trim(),
        years: Number(values.years),
        remark: String(values.remark || '').trim(),
      })
      message.success('订单创建成功')
      navigate('/orders', { replace: false })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: t.marginXL }}>
        <Typography.Title level={4} style={{ margin: `0 0 ${t.marginXXS}` }}>
          新建订单
        </Typography.Title>
        <Typography.Text type="secondary">
          填写会员与购卡信息，提交后订单进入「待审核」
        </Typography.Text>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <Form form={form} layout="vertical" onFinish={handleFinish}>
          <Form.Item
            name="memberName"
            label="会员姓名"
            extra="2~30 个字符，支持中英文"
            rules={[
              { required: true, whitespace: true, message: '请输入会员姓名' },
              {
                // 按 trim 后的长度校验，与 mock 服务端（server.js 先 trim 再判 2~30）保持一致。
                // 否则 " a " 这类输入客户端判定长度 3 放行、服务端 trim 后判 1 拒绝，前端直接弹 400。
                validator: (_rule, value) => {
                  if (isBlankValue(value)) return Promise.resolve()
                  const len = String(value).trim().length
                  return len >= 2 && len <= 30
                    ? Promise.resolve()
                    : Promise.reject(new Error('会员姓名长度需为 2~30 个字符'))
                },
              },
            ]}
          >
            <Input placeholder="请输入会员姓名" maxLength={30} showCount allowClear />
          </Form.Item>

          <Form.Item
            name="phone"
            label="联系手机号"
            rules={[
              { required: true, message: '请输入联系手机号' },
              {
                validator: (_rule, value) => {
                  if (isBlankValue(value)) return Promise.resolve()
                  return PHONE_RE.test(String(value).trim())
                    ? Promise.resolve()
                    : Promise.reject(new Error('请输入正确的 11 位手机号'))
                },
              },
            ]}
          >
            <Input placeholder="请输入 11 位手机号" maxLength={11} allowClear />
          </Form.Item>

          <Form.Item
            name="years"
            label="购卡年限"
            extra={`取值 ${MIN_YEARS}~${MAX_YEARS} 年的整数`}
            rules={[
              { required: true, message: '请输入购卡年限' },
              {
                validator: (_rule, value) => {
                  if (isBlankValue(value)) return Promise.resolve()
                  const n = Number(value)
                  const ok = Number.isInteger(n) && n >= MIN_YEARS && n <= MAX_YEARS
                  return ok
                    ? Promise.resolve()
                    : Promise.reject(new Error(`购卡年限需为 ${MIN_YEARS}~${MAX_YEARS} 的整数`))
                },
              },
            ]}
          >
            <InputNumber
              min={MIN_YEARS}
              max={MAX_YEARS}
              precision={0}
              step={1}
              placeholder={`请输入 ${MIN_YEARS}~${MAX_YEARS} 的整数`}
              style={{ width: '100%' }}
            />
          </Form.Item>

          {/* 费用只读：随年限联动，金额以服务端计算为准，因此不参与提交 */}
          <Form.Item
            label="办卡费用"
            extra={`按 ${ANNUAL_PRICE} 元/年 自动计算，不可修改`}
            style={{ marginBottom: t.marginLG }}
          >
            <Input
              readOnly
              value={amountText}
              suffix="元"
              style={{
                color: t.colorTextHeading,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            />
          </Form.Item>

          <Form.Item name="remark" label="备注" style={{ marginBottom: t.margin }}>
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              placeholder="选填，如办卡门店、优惠说明等"
            />
          </Form.Item>

          <Space>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={submitting}
              disabled={submitting}
            >
              提交
            </Button>
            <Button
              htmlType="button"
              icon={<ArrowLeftOutlined />}
              disabled={submitting}
              onClick={() => navigate('/orders')}
            >
              取消
            </Button>
          </Space>
        </Form>
      </div>
    </div>
  )
}
