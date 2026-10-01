import { CreditCardOutlined, LockOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Form, Input, Typography, theme } from 'antd'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

/** 没有「原始访问路径」时的兜底落点 */
const DEFAULT_REDIRECT = '/orders'

/**
 * 解析登录后的跳转目标。
 * RequireAuth 会把原本要访问的路径放在 location.state.from，
 * 非字符串、跨站路径（//evil.com）或指回登录页时都退回默认落点。
 */
function resolveRedirect(state) {
  const from = state?.from
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) {
    if (from !== '/login') return from
  }
  return DEFAULT_REDIRECT
}

export default function Login() {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const { message } = App.useApp()
  const token = useAuthStore((state) => state.token)
  const login = useAuthStore((state) => state.login)
  const t = theme.useToken()

  const handleFinish = async (values) => {
    if (submitting) return
    setSubmitting(true)
    setErrorText('')
    try {
      const result = await login(values.username, values.password)
      if (!result?.ok) {
        // axios 拦截器已经弹过错误提示，这里只在表单内呈现，避免重复弹窗
        setErrorText(result?.message || '登录失败，请稍后重试')
        return
      }
      message.success('登录成功')
      navigate(resolveRedirect(location.state), { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  // 已有 token：直接去订单列表，不再渲染表单
  if (token) return <Navigate to={DEFAULT_REDIRECT} replace />

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: t.margin,
        background: `linear-gradient(180deg, ${t.colorFillQuaternary} 0%, ${t.colorBgLayout} 60%)`,
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* 品牌区：图标尺寸与 AppLayout 侧栏保持一致 */}
        <div style={{ textAlign: 'center', marginBottom: t.marginLG }}>
          <div
            style={{
              width: 44,
              height: 44,
              margin: `0 auto ${t.marginSM}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: t.borderRadiusLG,
              background: t.colorPrimaryBg,
              color: t.colorPrimary,
              fontSize: 22,
            }}
          >
            <CreditCardOutlined />
          </div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            健身房会员办卡订单管理
          </Typography.Title>
          <Typography.Text type="secondary">会员办卡订单管理后台</Typography.Text>
        </div>

        <Card style={{ boxShadow: t.boxShadowSecondary }}>
          <Form
            form={form}
            layout="vertical"
            size="large"
            requiredMark={false}
            onFinish={handleFinish}
          >
            <Form.Item
              name="username"
              label="账号"
              rules={[{ required: true, whitespace: true, message: '请输入账号' }]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="请输入账号"
                autoComplete="username"
                allowClear
                autoFocus
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, whitespace: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </Form.Item>

            {errorText && (
              <Form.Item style={{ marginBottom: t.margin }}>
                <Alert type="error" showIcon message={errorText} />
              </Form.Item>
            )}

            <Form.Item style={{ marginBottom: t.marginSM }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={submitting}
                disabled={submitting}
              >
                登录
              </Button>
            </Form.Item>
          </Form>

          <Typography.Text
            type="secondary"
            style={{ display: 'block', textAlign: 'center', fontSize: t.fontSizeSM }}
          >
            演示环境：任意账号密码均可登录
          </Typography.Text>
        </Card>
      </div>
    </div>
  )
}
