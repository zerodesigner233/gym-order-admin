import {
  CreditCardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusSquareOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Avatar, Breadcrumb, Button, Dropdown, Layout, Menu, Typography, theme } from 'antd'
import { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const { Header, Sider, Content } = Layout

const MENU_ITEMS = [
  { key: '/orders', icon: <FileTextOutlined />, label: '订单列表' },
  { key: '/orders/new', icon: <PlusSquareOutlined />, label: '新建订单' },
]

const BREADCRUMB_MAP = {
  '/orders': ['订单管理', '订单列表'],
  '/orders/new': ['订单管理', '新建订单'],
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const {
    token: { colorBgContainer, colorBorderSecondary },
  } = theme.useToken()

  /** 选中项：/orders/new 要盖过 /orders，避免两个菜单同时高亮 */
  const selectedKeys = useMemo(
    () => [MENU_ITEMS.map((i) => i.key).find((k) => k === location.pathname) || '/orders'],
    [location.pathname],
  )

  const breadcrumbItems = useMemo(() => {
    const titles = BREADCRUMB_MAP[location.pathname] || ['订单管理', '未知页面']
    return titles.map((title) => ({ title }))
  }, [location.pathname])

  const displayName = user?.nickname || user?.username || '未登录'

  const handleMenuClick = ({ key }) => navigate(key)

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const userMenu = {
    items: [
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        onClick: handleLogout,
      },
    ],
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="light"
        collapsible
        collapsed={collapsed}
        trigger={null}
        width={220}
        style={{ borderRight: `1px solid ${colorBorderSecondary}` }}
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderBottom: `1px solid ${colorBorderSecondary}`,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          <CreditCardOutlined style={{ fontSize: 22, color: '#1677ff' }} />
          {!collapsed && (
            <Typography.Text strong style={{ fontSize: 15 }}>
              办卡订单管理
            </Typography.Text>
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          items={MENU_ITEMS}
          onClick={handleMenuClick}
          style={{ borderInlineEnd: 'none' }}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            padding: '0 16px',
            height: 56,
            lineHeight: '56px',
            background: colorBgContainer,
            borderBottom: `1px solid ${colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Button
            type="text"
            aria-label={collapsed ? '展开菜单' : '收起菜单'}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((v) => !v)}
          />
          <Breadcrumb items={breadcrumbItems} style={{ flex: 1 }} />
          <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
            <Button type="text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size={22} icon={<UserOutlined />} style={{ background: '#1677ff' }} />
              <Typography.Text>{displayName}</Typography.Text>
            </Button>
          </Dropdown>
        </Header>

        <Content style={{ padding: 16, background: '#f5f6f8' }}>
          <div
            style={{
              background: colorBgContainer,
              borderRadius: 8,
              padding: 16,
              minHeight: 'calc(100vh - 120px)',
            }}
          >
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
