import { CreditCardOutlined } from '@ant-design/icons'
import { Button, Card, Result, Typography, theme } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

/**
 * 404 页在路由守卫之外，登录与否都要能看懂、能操作，
 * 因此主按钮根据登录态决定是回列表还是去登录。
 */
export default function NotFound() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = useAuthStore((state) => state.token)
  const t = theme.useToken()

  const action = token
    ? { label: '返回订单列表', to: '/orders' }
    : { label: '去登录', to: '/login' }

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
      <div style={{ width: '100%', maxWidth: 520 }}>
        {/* 品牌区：与登录页、侧栏 Logo 同一套品牌表达 */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: t.marginXS, marginBottom: t.margin }}
        >
          <span style={{ color: t.colorPrimary, fontSize: 22, lineHeight: 1 }}>
            <CreditCardOutlined />
          </span>
          <div>
            <Typography.Text strong>健身房会员办卡订单管理</Typography.Text>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: t.fontSizeSM }}>
                会员办卡订单管理后台
              </Typography.Text>
            </div>
          </div>
        </div>

        <Card style={{ boxShadow: t.boxShadowSecondary }}>
          <Result
            status="404"
            title={
              <Typography.Title level={3} style={{ marginBottom: t.marginXS }}>
                页面不存在
              </Typography.Title>
            }
            subTitle="抱歉，你访问的页面不存在或已被移除"
            extra={
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: t.marginXS,
                }}
              >
                <Button type="primary" size="large" onClick={() => navigate(action.to)}>
                  {action.label}
                </Button>
                <Button type="link" onClick={() => navigate(-1)}>
                  返回上一页
                </Button>
              </div>
            }
          />

          <div
            style={{
              marginTop: t.marginSM,
              paddingTop: t.marginSM,
              borderTop: `1px solid ${t.colorBorderSecondary}`,
              textAlign: 'center',
            }}
          >
            <Typography.Text type="secondary" style={{ fontSize: t.fontSizeSM }}>
              当前访问路径：
            </Typography.Text>
            <Typography.Text className="mono-cell" style={{ fontSize: t.fontSizeSM }}>
              {location.pathname}
            </Typography.Text>
          </div>
        </Card>
      </div>
    </div>
  )
}
