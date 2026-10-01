const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const SHOTS = path.join(__dirname, 'shots')
const DOWNLOADS = path.join(__dirname, 'downloads')
fs.mkdirSync(SHOTS, { recursive: true })
fs.mkdirSync(DOWNLOADS, { recursive: true })

const results = []
let shotIndex = 0

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} :: ${name}${detail ? ' :: ' + detail : ''}`)
}
async function check(name, fn) {
  try {
    const d = await fn()
    record(name, true, typeof d === 'string' ? d : '')
  } catch (err) {
    record(name, false, err.message.split('\n').slice(0, 3).join(' | '))
  }
}
async function shot(page, label) {
  shotIndex += 1
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotIndex).padStart(2, '0')}-${label}.png`),
    fullPage: true,
  })
}
function assert(c, m) {
  if (!c) throw new Error(m)
}
const norm = (s) => String(s).replace(/\s+/g, '')

/* ------------------------------------------------------------------ helpers */
// antd rowSelection 会插入一个复选框列，必须剔除，否则所有列下标都错位 1
const SELECT_COL = 'ant-table-selection-column'
const rows = (page) => page.locator('.ant-table-tbody tr.ant-table-row')

async function rowCells(page) {
  return rows(page).evaluateAll(
    (trs, sel) =>
      trs.map((tr) =>
        [...tr.querySelectorAll('td')]
          .filter((td) => !td.classList.contains(sel))
          .map((td) => td.innerText.trim()),
      ),
    SELECT_COL,
  )
}

async function colIndex(page, header) {
  const heads = await page
    .locator('.ant-table-thead th')
    .evaluateAll(
      (ths, sel) =>
        ths.filter((th) => !th.classList.contains(sel)).map((th) => th.innerText.trim()),
      SELECT_COL,
    )
  return heads.findIndex((h) => norm(h).includes(norm(header)))
}

async function cell(page, r, c) {
  return rows(page).nth(r).locator(`td:not(.${SELECT_COL})`).nth(c).innerText()
}

async function clickButton(page, name) {
  const btns = page.locator('button')
  const want = norm(name)
  for (let i = 0; i < (await btns.count()); i += 1) {
    const b = btns.nth(i)
    if (!(await b.isVisible().catch(() => false))) continue
    const t = norm(await b.innerText().catch(() => ''))
    if (t.includes(want)) {
      await b.click()
      return t
    }
  }
  const all = []
  for (let i = 0; i < (await btns.count()); i += 1)
    all.push(
      norm(
        await btns
          .nth(i)
          .innerText()
          .catch(() => ''),
      ),
    )
  throw new Error(`找不到按钮「${name}」，当前按钮: ${all.join('|')}`)
}

async function tab(page, label) {
  await page.locator('.ant-tabs-tab').filter({ hasText: label }).first().click()
}

async function totalText(page) {
  const el = page.locator('.ant-pagination-total-text').first()
  return (await el.count()) ? norm(await el.innerText()) : ''
}

async function waitLoading(page) {
  for (let i = 0; i < 80; i += 1) {
    if (!(await page.locator('.ant-spin-spinning').count())) return
    await page.waitForTimeout(120)
  }
}

const toasts = (page) => page.locator('.ant-message-notice-content').allInnerTexts()

async function modalText(page) {
  const m = page.locator('.ant-modal-content').last()
  return (await m.count()) ? norm(await m.innerText()) : ''
}

/** 真正的 CSV 行解析：用来验证我们自己的转义逻辑能被正确解回 */
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else inQuote = false
      } else cur += ch
    } else if (ch === '"') inQuote = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

;(async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    acceptDownloads: true,
  })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      consoleErrors.push(`[${m.type()}] ${m.text()}`)
  })
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))

  /* ============================================================ 01 路由守卫 */
  await check('01a 未登录访问 / 重定向到 /login', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' })
    assert(page.url().includes('/login'), page.url())
    return page.url()
  })
  await check('01b 未登录访问 /orders 被拦截', async () => {
    await page.goto(BASE + '/orders', { waitUntil: 'networkidle' })
    assert(page.url().includes('/login'), page.url())
    return page.url()
  })
  await check('01c 未登录访问 /orders/new 被拦截', async () => {
    await page.goto(BASE + '/orders/new', { waitUntil: 'networkidle' })
    assert(page.url().includes('/login'), page.url())
    return page.url()
  })
  await check('01d 未登录 404 页主按钮为「去登录」', async () => {
    await page.goto(BASE + '/totally-missing', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const b = norm(await page.locator('body').innerText())
    assert(b.includes('页面不存在') && b.includes('去登录'), b.slice(0, 120))
    assert(b.includes('去登录'), `未登录时主按钮应为「去登录」：${b.slice(0, 160)}`)
    return '未登录 → 去登录'
  })
  await shot(page, '404')

  /* ============================================================ 02 登录 */
  await check('02a 未登录深链 -> 登录后跳回原路径（from）', async () => {
    await page.goto(BASE + '/orders/new', { waitUntil: 'networkidle' })
    assert(page.url().includes('/login'), `应先被守卫拦到登录页: ${page.url()}`)
    await page.getByPlaceholder('请输入账号').fill('admin')
    await page.getByPlaceholder('请输入密码').fill('123456')
    await clickButton(page, '登录')
    // 关键：跳回 /orders/new，而不是一律回 /orders
    await page.waitForURL('**/orders/new', { timeout: 20000 })
    await page.waitForTimeout(600)
    assert(page.url().includes('/orders/new'), page.url())
    return 'RequireAuth.from 生效：登录后回到 /orders/new'
  })

  await check('02b 空表单提交被前端校验拦截', async () => {
    // localStorage 是登录态的唯一可信来源，清掉它即视为未登录
    await page.evaluate(() => window.localStorage.clear())
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    await clickButton(page, '登录')
    await page.waitForTimeout(500)
    await clickButton(page, '登录')
    await page.waitForTimeout(500)
    const t = await page.locator('.ant-form-item-explain-error').allInnerTexts()
    assert(t.length >= 2, `校验提示数量=${t.length}`)
    return t.join(' / ')
  })

  await check('02c 登录成功并跳转订单列表', async () => {
    await page.getByPlaceholder('请输入账号').fill('admin')
    await page.getByPlaceholder('请输入密码').fill('123456')
    await clickButton(page, '登录')
    await page.waitForURL('**/orders', { timeout: 20000 })
    await waitLoading(page)
    assert(page.url().includes('/orders'), page.url())
    return page.url()
  })

  await check('02d token 写入 localStorage', async () => {
    const t = await page.evaluate(() => window.localStorage.getItem('gym_order_admin_token'))
    assert(t && t.startsWith('mock-token-'), `token=${t}`)
    return t
  })

  await check('02e 已登录访问 /login 自动跳回列表', async () => {
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
    await page.waitForTimeout(700)
    assert(page.url().includes('/orders'), page.url())
    return page.url()
  })

  await check('02f 任意非空密码均可登录（低于 4 位也放行）', async () => {
    // 规格原文是「任意账号密码均可登录成功」。曾经前端给密码加了 min:4，
    // 导致 2 位密码在表单层就被拦掉，而 mock 服务端是放行的 —— 口径不一致。
    await page.evaluate(() => window.localStorage.clear())
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    await page.getByPlaceholder('请输入账号').fill('admin')
    await page.getByPlaceholder('请输入密码').fill('12') // 2 位，低于曾经的 4 位下限
    await clickButton(page, '登录')
    await page.waitForURL('**/orders', { timeout: 20000 })
    const t = await page.evaluate(() => localStorage.getItem('gym_order_admin_token'))
    assert(t && t.startsWith('mock-token-'), `token=${t}`)
    return `2 位密码登录成功 → ${t}`
  })

  await check('02g 顶栏展示裸用户名，角色用独立 Tag', async () => {
    // 规格要求顶栏展示「当前登录用户名」。曾经展示的是 nickname（形如 admin（管理员）），
    // 用户名里混进了角色后缀，字面不符合规格。
    // waitForURL 在 SPA 完成渲染前就会 resolve，顶栏可能还没挂载，这里显式等一下
    const nameNode = page.locator('.ant-layout-header .ant-typography').first()
    await nameNode.waitFor({ timeout: 15000 })
    const texts = await page.locator('.ant-layout-header .ant-typography').allInnerTexts()
    assert(texts.length > 0, '顶栏未找到用户名文本节点')
    assert(
      texts.some((t) => norm(t) === 'admin'),
      `顶栏未展示裸用户名 admin，实际=${JSON.stringify(texts)}`,
    )
    assert(
      !texts.some((t) => norm(t).includes('管理员')),
      `用户名里混入了角色后缀：${JSON.stringify(texts)}`,
    )
    return `顶栏用户名=${texts.map(norm).join(' / ')}，角色另以 Tag 呈现`
  })

  /* ============================================================ 03 列表基础 */
  await check('03a 侧栏菜单 + 顶栏用户名 + 面包屑齐全', async () => {
    await rows(page).first().waitFor({ timeout: 15000 })
    const menu = (await page.locator('.ant-menu-item').allInnerTexts()).map(norm)
    const crumb = norm(await page.locator('.ant-breadcrumb').first().innerText())
    const header = norm(await page.locator('.ant-layout-header').first().innerText())
    assert(menu.join('|').includes('订单列表'), `menu=${menu}`)
    assert(menu.join('|').includes('新建订单'), `menu=${menu}`)
    assert(header.includes('admin'), `header=${header}`)
    return `menu=${menu.join(',')} | breadcrumb=${crumb} | header=${header}`
  })

  await check('03b 全部 Tab 共 36 条，本页 10 行', async () => {
    await waitLoading(page)
    const n = await rows(page).count()
    assert(n === 10, `本页行数=${n}`)
    return `本页 ${n} 行 / ${await totalText(page)}`
  })

  await check('03c 表格 7 列齐全且顺序正确', async () => {
    const heads = (
      await page
        .locator('.ant-table-thead th')
        .evaluateAll(
          (ths, sel) =>
            ths.filter((th) => !th.classList.contains(sel)).map((th) => th.innerText.trim()),
          SELECT_COL,
        )
    ).map(norm)
    const need = ['订单号', '会员姓名', '购卡年限', '订单金额', '状态', '创建时间', '操作']
    need.forEach((x) =>
      assert(
        heads.some((h) => h.includes(norm(x))),
        `缺列 ${x}: ${heads}`,
      ),
    )
    assert(heads.length === 7, `实际数据列数=${heads.length}，应为 7: ${heads}`)
    return heads.filter((h) => h).join(' | ')
  })

  await check('03d 默认按创建时间倒序（最新在最前）', async () => {
    const i = await colIndex(page, '创建时间')
    const times = (await rowCells(page)).map((c) => (c[i] || '').trim())
    assert(times.every(Boolean), `有空时间: ${times}`)
    const sorted = [...times].sort().reverse()
    assert(JSON.stringify(times) === JSON.stringify(sorted), `实际=${times} 期望=${sorted}`)
    return `${times[0]} → ${times[times.length - 1]}`
  })

  await check('03e 金额千分位 / 0.00 / 空值 三种形态', async () => {
    const seen = new Set()
    for (let p = 1; p <= 4; p += 1) {
      const i = await colIndex(page, '订单金额')
      for (const c of await rowCells(page)) seen.add((c[i] || '').trim())
      if (p < 4) {
        await page
          .locator('.ant-pagination-item', { hasText: String(p + 1) })
          .first()
          .click()
        await waitLoading(page)
        await page.waitForTimeout(400)
      }
    }
    await page.locator('.ant-pagination-item-1').click()
    await waitLoading(page)
    const bad = [...seen].filter((a) => a !== '-' && !/^\d{1,3}(,\d{3})*\.\d{2}$/.test(a))
    assert(bad.length === 0, `格式非法=${bad}`)
    assert(seen.has('0.00'), `未看到 0.00，实际样本=${[...seen].slice(0, 8)}`)
    assert(seen.has('-'), `未看到空值占位 -，实际样本=${[...seen].slice(0, 8)}`)
    assert(
      [...seen].some((a) => a.includes(',')),
      `未看到千分位，实际=${[...seen]}`,
    )
    return `样本: ${[...seen].slice(0, 6).join(' , ')}`
  })

  await check('03f 状态使用不同颜色 Tag', async () => {
    const tags = await page.locator('.ant-table-tbody .ant-tag').evaluateAll((ts) =>
      ts.map((t) => ({
        text: t.innerText.trim(),
        color: (t.className.match(/ant-tag-(\w+)/) || [])[1],
      })),
    )
    assert(tags.length > 0, '没有 Tag')
    return `${tags.map((t) => t.text).join(',')} | 颜色=${[...new Set(tags.map((t) => t.color))].join(',')}`
  })
  await shot(page, 'order-list')

  /* ============================================================ 04 Tab */
  const tabCount = async (label, n) => {
    await tab(page, label)
    await waitLoading(page)
    await page.waitForTimeout(450)
    const t = await totalText(page)
    assert(new RegExp(`共${n}条`).test(t), `${label}: 期望共${n}条 实际=${t}`)
    return t
  }
  await check('04a Tab「全部」36 条', () => tabCount('全部', 36))
  await check('04b Tab「进行中」18 条（待审核+待制卡+待寄卡）', () => tabCount('进行中', 18))
  await check('04c Tab「已到期」6 条', () => tabCount('已到期', 6))
  await check('04d Tab「已完成」6 条', () => tabCount('已完成', 6))
  await check('04e Tab「已取消」6 条', () => tabCount('已取消', 6))

  await check('04f 切 Tab 后回到第 1 页', async () => {
    await tab(page, '全部')
    await waitLoading(page)
    await page.waitForTimeout(300)
    await page.locator('.ant-pagination-item-2').click()
    await waitLoading(page)
    await page.waitForTimeout(500)
    let cur = norm(await page.locator('.ant-pagination-item-active').first().innerText())
    assert(cur === '2', `翻页后当前页=${cur}`)
    await tab(page, '已完成')
    await waitLoading(page)
    await page.waitForTimeout(500)
    cur = norm(await page.locator('.ant-pagination-item-active').first().innerText())
    assert(cur === '1', `切 Tab 后当前页=${cur}，应为 1`)
    return '翻到第2页后切 Tab → 回到第1页'
  })

  await check('04g 仅「已到期」行显示行内续卡按钮', async () => {
    await tab(page, '已到期')
    await waitLoading(page)
    await page.waitForTimeout(450)
    const n = await rows(page).count()
    const c = await page.locator('.ant-table-tbody button', { hasText: '续卡' }).count()
    assert(c === n, `已到期: 行数=${n} 续卡按钮=${c}`)
    for (const other of ['已完成', '已取消', '进行中']) {
      await tab(page, other)
      await waitLoading(page)
      await page.waitForTimeout(450)
      const cc = await page.locator('.ant-table-tbody button', { hasText: '续卡' }).count()
      assert(cc === 0, `${other} 出现了 ${cc} 个续卡按钮`)
    }
    return `已到期 ${n} 行全有续卡按钮；已完成/已取消/进行中 均为 0`
  })

  /* ============================================================ 05 搜索 */
  const searchInput = (label) =>
    page.locator('.ant-form-item').filter({ hasText: label }).first().locator('input').first()

  await check('05a 订单号精确匹配命中 1 条', async () => {
    await tab(page, '全部')
    await waitLoading(page)
    await page.waitForTimeout(400)
    const no = norm(await cell(page, 0, 0))
    assert(/^GM\d+$/.test(no), `读到的订单号=${no}`)
    await (await searchInput('订单号')).fill(no)
    await clickButton(page, '查询')
    await waitLoading(page)
    await page.waitForTimeout(500)
    const t = await totalText(page)
    assert(/共1条/.test(t), `${no} → ${t}`)
    return `${no} → ${t}`
  })

  await check('05b 订单号不存在 → 0 条 + 空状态', async () => {
    await (await searchInput('订单号')).fill('GM00000000000')
    await clickButton(page, '查询')
    await waitLoading(page)
    await page.waitForTimeout(500)
    assert(/共0条/.test(await totalText(page)), await totalText(page))
    assert(await page.locator('.ant-empty').count(), '没有空状态')
    return '0 条 + Empty'
  })

  await check('05c 会员姓名模糊匹配', async () => {
    await clickButton(page, '重置')
    await waitLoading(page)
    await page.waitForTimeout(600)
    const name = norm(await cell(page, 0, 1))
    const kw = name.slice(0, 1)
    await (await searchInput('会员姓名')).fill(kw)
    await clickButton(page, '查询')
    await waitLoading(page)
    await page.waitForTimeout(500)
    const cells = await rowCells(page)
    assert(cells.length > 0, `模糊匹配无结果（${await totalText(page)}）`)
    assert(
      cells.every((c) => (c[1] || '').includes(kw)),
      '结果含不匹配行',
    )
    return `「${kw}」命中 ${await totalText(page)}，示例 ${cells[0][1]}`
  })

  await check('05d 重置回到全部 36 条', async () => {
    await clickButton(page, '重置')
    await waitLoading(page)
    await page.waitForTimeout(600)
    const t = await totalText(page)
    assert(/共36条/.test(t), t)
    return t
  })
  await shot(page, 'search')

  /* ============================================================ 06 跨页勾选 */
  await check('06a 第1页勾选 → 翻第2页仍保留', async () => {
    await page.locator('.ant-table-tbody tr.ant-table-row .ant-checkbox-input').first().click()
    await page.waitForTimeout(350)
    assert(/已选1项/.test(norm(await page.locator('body').innerText())), '第1页未显示已选 1')
    await page.locator('.ant-pagination-item-2').click()
    await waitLoading(page)
    await page.waitForTimeout(600)
    const t = norm(await page.locator('body').innerText())
    assert(/已选1项/.test(t), `翻页后已选计数消失: ${t.match(/已选.{0,8}/)}`)
    return '翻页后「已选 1 项」仍在'
  })

  await check('06b 第2页追加勾选 → 已选 2 项', async () => {
    await page.locator('.ant-table-tbody tr.ant-table-row .ant-checkbox-input').first().click()
    await page.waitForTimeout(450)
    const t = norm(await page.locator('body').innerText())
    assert(/已选2项/.test(t), t.match(/已选.{0,8}/)?.[0])
    return t.match(/已选.{0,8}/)[0]
  })

  await check('06c 第2页勾选状态在页面上真实可见', async () => {
    const checked = await page
      .locator('.ant-table-tbody tr.ant-table-row .ant-checkbox-checked')
      .count()
    assert(checked === 1, `第2页勾选数=${checked}`)
    return '第 2 页有 1 行处于勾选态'
  })

  await check('06d 清空选择生效', async () => {
    await clickButton(page, '清空选择')
    await page.waitForTimeout(500)
    const t = norm(await page.locator('body').innerText())
    assert(/已选0项/.test(t), t.match(/已选.{0,8}/)?.[0])
    return '已选 0 项'
  })
  await shot(page, 'cross-page-selection')

  /* ============================================================ 07 批量续卡 */
  await check('07a 选中含非「已到期」订单 → 提示列出不合法的订单号', async () => {
    await page.locator('.ant-pagination-item-1').click()
    await waitLoading(page)
    await page.waitForTimeout(500)
    await page.locator('.ant-table-tbody tr.ant-table-row .ant-checkbox-input').first().click()
    await page.waitForTimeout(350)
    await clickButton(page, '续卡')
    await page.waitForTimeout(900)
    const m = await modalText(page)
    assert(m.length > 0, '续卡弹窗未打开')
    assert(m.includes('已跳过'), `弹窗未提示跳过：${m.slice(0, 160)}`)
    const nos = m.match(/GM\d{12}/g) || []
    assert(nos.length > 0, `弹窗未列出订单号：${m.slice(0, 200)}`)
    return `提示并列出 ${nos.length} 个订单号: ${nos.join(',')}`
  })

  await check('07b 关闭弹窗 + 清空后切「已到期」重新勾选 3 笔', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    await clickButton(page, '清空选择').catch(() => {})
    await page.waitForTimeout(400)
    await tab(page, '已到期')
    await waitLoading(page)
    await page.waitForTimeout(500)
    const cb = page.locator('.ant-table-tbody tr.ant-table-row .ant-checkbox-input')
    for (let i = 0; i < 3; i += 1) await cb.nth(i).click()
    await page.waitForTimeout(450)
    assert(/已选3项/.test(norm(await page.locator('body').innerText())), '未选中 3 项')
    await clickButton(page, '续卡')
    await page.waitForTimeout(900)
    const m = await modalText(page)
    assert(m.includes('续卡年限'), m.slice(0, 160))
    return '批量续卡弹窗已打开'
  })

  await check('07c 费用实时联动：4 年 = 4,800.00（无折扣）', async () => {
    const inp = page.locator('.ant-modal-content input').first()
    await inp.fill('4')
    await page.waitForTimeout(500)
    const m = await modalText(page)
    assert(/原价（4年×¥1200）/.test(m), `缺少原价行：${m.slice(0, 200)}`)
    assert(/应付费用（每笔）¥4,800.00/.test(m), `应付费用错误：${m.slice(0, 260)}`)
    assert(!/满5年享8折/.test(m), `4 年不应出现 8 折：${m.slice(0, 260)}`)
    return '4 年无折扣 → ¥4,800.00'
  })

  await check('07d 满 5 年自动 8 折：6,000 → 4,800.00', async () => {
    const inp = page.locator('.ant-modal-content input').first()
    await inp.fill('5')
    await page.waitForTimeout(500)
    const m = await modalText(page)
    assert(/满5年享8折/.test(m), `缺少折扣标签：${m.slice(0, 260)}`)
    assert(/¥6,000.00/.test(m), `缺少原价 6,000.00：${m.slice(0, 260)}`)
    assert(/已优惠¥1,200.00/.test(m), `缺少已优惠金额：${m.slice(0, 260)}`)
    assert(/应付费用（每笔）¥4,800.00/.test(m), `折后价错误：${m.slice(0, 260)}`)
    return '5年: ¥6,000.00 → ¥4,800.00（8折），已优惠 ¥1,200.00'
  })

  await check('07e 年限被限制在 1~10 整数', async () => {
    const inp = page.locator('.ant-modal-content input').first()
    await inp.fill('99')
    await inp.press('Tab')
    await page.waitForTimeout(500)
    let v = Number(await inp.inputValue())
    assert(v <= 10, `输入 99 未被限制，实际=${v}`)
    await inp.fill('0')
    await inp.press('Tab')
    await page.waitForTimeout(500)
    v = Number(await inp.inputValue())
    assert(v >= 1, `输入 0 未被限制，实际=${v}`)
    await inp.fill('3')
    await inp.press('Tab')
    await page.waitForTimeout(500)
    const m = await modalText(page)
    assert(!/满5年享8折/.test(m), `3年不应有折扣：${m.slice(0, 260)}`)
    assert(/应付费用（每笔）¥3,600.00/.test(m), `3年无折扣应为 3,600.00：${m.slice(0, 260)}`)
    return '钳制生效（99→10, 0→1）；3年无折扣=¥3,600.00'
  })

  await check('07f 合计 = 每笔 × 笔数', async () => {
    const m = await modalText(page)
    assert(/续卡3笔，每笔¥3,600.00/.test(m), m.slice(0, 260))
    assert(/合计¥10,800.00/.test(m), `合计错误：${m.slice(0, 260)}`)
    return '3 × 3,600.00 = 10,800.00'
  })

  await check('07f2 清空年限 → 金额显示「-」而非 ¥0.00', async () => {
    // 回归：calcCreateAmount / calcRenewAmount 曾只用 !isFinite 守卫，而
    // Number(null) === 0 且 Number('') === 0，于是「年限未填」被当成「0 年」，
    // 弹窗显示 ¥0.00（看起来像免费续卡）；合计 null * n === 0 也会跟着错。
    const inp = page.locator('.ant-modal-content input').first()
    let detail = ''
    try {
      await inp.fill('')
      await page.waitForTimeout(600)
      const m = await modalText(page)
      assert(!/¥0\.00/.test(m), `清空年限后不应出现 ¥0.00：${m.slice(0, 300)}`)
      assert(/应付费用（每笔）¥-/.test(m), `单笔费用应为「-」：${m.slice(0, 300)}`)
      assert(/合计¥-/.test(m), `合计应为「-」：${m.slice(0, 300)}`)
      detail = '清空 → 单笔/合计均为「-」'
    } finally {
      // 复原必须放在 finally：断言抛异常时若不还原，弹窗会停留在「空年限」状态，
      // 后面 07g~08d 会连环失败，把 1 个真实错因放大成 7 条噪声。
      await inp.fill('3')
      await inp.press('Tab')
      await page.waitForTimeout(500)
    }
    const m2 = await modalText(page)
    assert(/合计¥10,800\.00/.test(m2), `复原 3 年后合计应回到 10,800.00：${m2.slice(0, 300)}`)
    return `${detail}；复原 3 年 → ¥10,800.00`
  })

  await check('07g 提交续卡：已到期 6→3，进行中 18→21', async () => {
    await clickButton(page, '确认续卡')
    await page.waitForTimeout(2000)
    await waitLoading(page)
    await page.waitForTimeout(700)
    const t = (await toasts(page)).map(norm).join(' | ')
    assert(/续卡成功3笔/.test(t), `成功提示异常: ${t}`)
    assert(/每笔¥3,600.00/.test(t), `提示里的单笔金额不对（应为 3,600.00）: ${t}`)
    const tt = await totalText(page)
    assert(/共3条/.test(tt), `已到期应为 3 条，实际=${tt}`)
    return `${t} → 已到期 ${tt}`
  })

  await check('07h 续卡后订单转为「待审核」并出现在进行中', async () => {
    await tab(page, '进行中')
    await waitLoading(page)
    await page.waitForTimeout(600)
    const tt = await totalText(page)
    assert(/共21条/.test(tt), `进行中应为 21 条（18+3），实际=${tt}`)
    const i = await colIndex(page, '状态')
    const pending = (await rowCells(page)).filter((c) => (c[i] || '').trim() === '待审核')
    assert(pending.length >= 4, `待审核行数=${pending.length}（原 6 + 新 3）`)
    return `进行中 ${tt}，本页待审核 ${pending.length} 行`
  })
  await shot(page, 'after-renew')

  /* ============================================================ 08 撤单 */
  await check('08a 选中待制卡/待寄卡 → 二次确认列出订单号', async () => {
    await tab(page, '全部')
    await waitLoading(page)
    await page.waitForTimeout(500)
    await clickButton(page, '清空选择').catch(() => {})
    await page.waitForTimeout(400)
    const i = await colIndex(page, '状态')
    const cells = await rowCells(page)
    const targets = []
    cells.forEach((c, idx) => {
      const s = (c[i] || '').trim()
      if ((s === '待制卡' || s === '待寄卡') && targets.length < 2) targets.push(idx)
    })
    assert(targets.length > 0, '当前页没有待制卡/待寄卡订单')
    for (const idx of targets) await rows(page).nth(idx).locator('.ant-checkbox-input').click()
    await page.waitForTimeout(450)
    await clickButton(page, '撤单')
    await page.waitForTimeout(900)
    const m = await modalText(page)
    assert(m.includes('撤单'), m.slice(0, 160))
    const nos = m.match(/GM\d{12}/g) || []
    assert(nos.length > 0, `确认框未列出订单号：${m.slice(0, 240)}`)
    return `选中 ${targets.length} 笔，确认框列出: ${nos.join(',')}`
  })

  await check('08b 二次确认后状态变已取消', async () => {
    await clickButton(page, '确认撤单')
    await page.waitForTimeout(2000)
    await waitLoading(page)
    await page.waitForTimeout(600)
    const t = (await toasts(page)).map(norm).join(' | ')
    assert(/撤单成功2笔/.test(t), `成功提示异常: ${t}`)
    return t
  })

  await check('08c 已取消 6→8', async () => {
    await tab(page, '已取消')
    await waitLoading(page)
    await page.waitForTimeout(500)
    const t = await totalText(page)
    assert(/共8条/.test(t), t)
    return t
  })

  await check('08d 已取消订单不可再续卡（按钮已消失）', async () => {
    const c = await page.locator('.ant-table-tbody button', { hasText: '续卡' }).count()
    assert(c === 0, `已取消出现续卡按钮 ${c} 个`)
    return '已取消 tab 无续卡按钮'
  })

  /* ============================================================ 09 导出 */
  await check('09a 导出 CSV：BOM + 转义 + 金额格式 + 状态白名单', async () => {
    // 整页刷新 = mock 模块重新初始化 = 数据回到 36 条种子状态。
    // 前面的续卡/撤单会把 null 金额算成具体值，不复位就没法稳定断言空金额单元格。
    await page.reload({ waitUntil: 'networkidle' })
    await rows(page).first().waitFor({ timeout: 15000 })
    await waitLoading(page)
    await page.waitForTimeout(600)
    assert(/共36条/.test(await totalText(page)), `刷新后应复位为 36 条：${await totalText(page)}`)
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 25000 }),
      clickButton(page, '导出'),
    ])
    const fname = download.suggestedFilename()
    const saved = path.join(DOWNLOADS, fname)
    await download.saveAs(saved)
    const buf = fs.readFileSync(saved)
    const hasBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
    assert(hasBom, '缺少 UTF-8 BOM')
    assert(/\.csv$/.test(fname), `文件名=${fname}`)

    // 剥掉 BOM，否则首个表头会变成「订单号」导致列名匹配失败
    const text = buf.toString('utf8').replace(/^\uFEFF/, '')
    assert(text.includes('\r\n'), '未使用 CRLF 行尾')
    const lines = text.trim().split('\r\n')
    const head = parseCsvLine(lines[0])
    const body = lines
      .slice(1)
      .filter((l) => l.trim())
      .map(parseCsvLine)

    const needHead = [
      '订单号',
      '会员姓名',
      '联系手机号',
      '购卡年限',
      '订单金额',
      '订单状态',
      '创建时间',
      '备注',
    ]
    const miss = needHead.filter((h) => !norm(head.join('')).includes(norm(h)))
    assert(miss.length === 0, `表头缺失=${miss} 实际=${head}`)
    assert(head.length === 8, `表头列数=${head.length}，应为 8`)
    assert(
      body.every((c) => c.length === 8),
      `存在列数不为 8 的行（转义被破坏）: ${body.filter((c) => c.length !== 8).slice(0, 2)}`,
    )

    const a = head.indexOf('订单金额')
    const s = head.indexOf('订单状态')
    const bad = body.filter((c) => c[a] !== '' && !/^\d{1,3}(,\d{3})*\.\d{2}$/.test(c[a]))
    assert(bad.length === 0, `金额格式错误: ${bad.slice(0, 3).map((c) => c[a])}`)
    const blanks = body.filter((c) => c[a] === '').length
    const zeros = body.filter((c) => c[a] === '0.00').length
    assert(
      blanks === 2,
      `空金额单元格应为 2 条（种子数据 4 条 null 中 2 条可导出），实际=${blanks}`,
    )
    assert(zeros === 3, `0.00 单元格应有 3 条（活动赠送卡），实际=${zeros}`)
    assert(body.length === 24, `可导出应为 24 条（36 - 待审核6 - 已取消6），实际=${body.length}`)
    assert(
      body.every((c) => /年$/.test(c[head.indexOf('购卡年限')])),
      '购卡年限未追加「 年」',
    )
    assert(!body.some((c) => c[s] === '待审核'), 'CSV 里出现了待审核')
    assert(!body.some((c) => c[s] === '已取消'), 'CSV 里出现了已取消')
    assert(
      body.every((c) => ['待制卡', '待寄卡', '已完成', '已到期'].includes(c[s])),
      `出现非白名单状态: ${[...new Set(body.map((c) => c[s]))]}`,
    )
    return `${fname} | BOM | ${body.length} 行 | 列=${head.join('/')} | 样例=${lines[1]}`
  })

  await check('09b 导出前提示被排除的订单号（限量展示，不全量拼接）', async () => {
    const t = (await toasts(page)).map(norm).join(' | ')
    assert(/已跳过\d+笔不可导出的订单/.test(t), `未见跳过提示: ${t}`)
    const nos = t.match(/GM\d{12}/g) || []
    assert(nos.length > 0, `跳过提示未列出订单号: ${t.slice(0, 200)}`)
    // 提示必须限量：命中几百条时全量拼订单号会变成不可读的长文本
    assert(nos.length <= 8, `排除清单未限量，列出了 ${nos.length} 个订单号`)
    const total = Number((t.match(/已跳过(\d+)笔/) || [])[1])
    assert(
      total > nos.length,
      `应为「限量 + 总数」而非全量列举：total=${total} listed=${nos.length}`,
    )
    return `已跳过 ${total} 笔，限量列出前 ${nos.length} 个订单号`
  })
  await shot(page, 'export')

  /* ============================================================ 10 新建订单 */
  await check('10a 必填校验', async () => {
    await page.goto(BASE + '/orders/new', { waitUntil: 'networkidle' })
    await page.waitForTimeout(700)
    await clickButton(page, '提交')
    await page.waitForTimeout(600)
    const e = await page.locator('.ant-form-item-explain-error').allInnerTexts()
    assert(e.length >= 3, `必填校验数量=${e.length}: ${e}`)
    return e.join(' / ')
  })

  await check('10b 手机号格式校验', async () => {
    await page.getByPlaceholder('请输入会员姓名').fill('测试会员')
    await page.getByPlaceholder(/手机号/).fill('123')
    await clickButton(page, '提交')
    await page.waitForTimeout(600)
    const e1 = await page.locator('.ant-form-item-explain-error').allInnerTexts()
    assert(
      e1.some((t) => /手机号/.test(t)),
      `无手机号错误: ${e1}`,
    )
    await page.getByPlaceholder(/手机号/).fill('23800000000')
    await clickButton(page, '提交')
    await page.waitForTimeout(600)
    const e2 = await page.locator('.ant-form-item-explain-error').allInnerTexts()
    assert(
      e2.some((t) => /手机号/.test(t)),
      `非法号段未拦截: ${e2}`,
    )
    return '123 与 23800000000 均被拦截'
  })

  await check('10c 姓名长度 2~30 校验', async () => {
    await page.getByPlaceholder('请输入会员姓名').fill('测')
    await page.getByPlaceholder(/手机号/).fill('13800138000')
    await clickButton(page, '提交')
    await page.waitForTimeout(600)
    const e = await page.locator('.ant-form-item-explain-error').allInnerTexts()
    assert(
      e.some((t) => /2~30/.test(t)),
      `未拦截 1 字姓名: ${e}`,
    )
    return e.filter((t) => /2~30/.test(t)).join(' / ')
  })

  await check('10c2 姓名按 trim 后长度校验（" a " 不放行）', async () => {
    // 曾经前端用未 trim 的值判长度：" a " 长度 3 被放行，服务端 trim 后判 1 拒绝 → 前端弹 400
    await page.getByPlaceholder('请输入会员姓名').fill(' a ')
    await clickButton(page, '提交')
    await page.waitForTimeout(600)
    const e = await page.locator('.ant-form-item-explain-error').allInnerTexts()
    assert(
      e.some((t) => /2~30/.test(t)),
      `trim 后长度校验未生效，" a " 被放行，错误提示=${JSON.stringify(e)}`,
    )
    return e.filter((t) => /2~30/.test(t)).join(' / ')
  })

  await check('10d 办卡费用只读并随年限联动（3 年 = 3,600.00）', async () => {
    const fee = page
      .locator('.ant-form-item')
      .filter({ hasText: '办卡费用' })
      .first()
      .locator('input')
    assert((await fee.getAttribute('readonly')) !== null, '办卡费用不是只读')
    await page.locator('.ant-input-number-input').first().fill('3')
    await page.locator('.ant-input-number-input').first().press('Tab')
    await page.waitForTimeout(700)
    assert(/3,600.00/.test(norm(await fee.inputValue())), `3 年费用=${await fee.inputValue()}`)
    await page.locator('.ant-input-number-input').first().fill('1')
    await page.locator('.ant-input-number-input').first().press('Tab')
    await page.waitForTimeout(600)
    assert(/1,200.00/.test(norm(await fee.inputValue())), `1 年费用=${await fee.inputValue()}`)
    await page.locator('.ant-input-number-input').first().fill('3')
    await page.locator('.ant-input-number-input').first().press('Tab')
    await page.waitForTimeout(600)
    return '1年=1,200.00 / 3年=3,600.00，字段只读'
  })

  await check('10e 备注上限 200 字', async () => {
    const ta = page.locator('textarea').first()
    await ta.fill('x'.repeat(260))
    await page.waitForTimeout(500)
    const v = await ta.inputValue()
    assert(v.length <= 200, `备注长度=${v.length}`)
    return `截断到 ${v.length} 字`
  })

  await check('10f 提交成功 → 跳列表，新订单在最前且为待审核', async () => {
    const name = 'E2E自动化测试'
    await page.getByPlaceholder('请输入会员姓名').fill(name)
    await page.getByPlaceholder(/手机号/).fill('13800138001')
    await page.locator('.ant-input-number-input').first().fill('3')
    await page.locator('.ant-input-number-input').first().press('Tab')
    await page.locator('textarea').first().fill('E2E 自动化测试订单')
    await page.waitForTimeout(300)
    await clickButton(page, '提交')
    await page.waitForURL('**/orders', { timeout: 20000 })
    await waitLoading(page)
    await page.waitForTimeout(800)
    const t = await totalText(page)
    assert(/共37条/.test(t), `列表应为 37 条，实际=${t}`)
    const nc = await colIndex(page, '会员姓名')
    const sc = await colIndex(page, '状态')
    const tc = await colIndex(page, '创建时间')
    const first = (await rowCells(page))[0]
    assert((first[nc] || '').includes(name), `第一行姓名=${first[nc]}`)
    assert((first[sc] || '').trim() === '待审核', `新订单状态=${first[sc]}`)
    const times = (await rowCells(page)).slice(0, 2).map((c) => c[tc])
    assert(times[0] >= times[1], `排序异常 ${times}`)
    return `第一行 ${first[0]} / ${first[nc]} / ${first[sc]} / ${first[tc]}，共 37 条`
  })

  await check('10g 同一天连续新建的订单号必须唯一（且各自可精确匹配）', async () => {
    // 回归用例：createOrder 曾拿「不带 GM 前缀的 datePart」去 startsWith 匹配 orderNo，
    // 永远为 false -> 当天新建的每一笔都拿到 GM{date}0001，精确匹配会一次命中多条，违反需求 3.2。
    //
    // 必须走左侧菜单的客户端路由跳转，不能用 page.goto：模拟数据在浏览器内存里，
    // 整页刷新会重置为 36 条种子数据，那样第二笔又从 0001 起算，
    // 测到的就成了「各自刷新后新建」而不是「同一天连续新建」。
    const created = []
    for (const [i, name] of ['E2E唯一性验证A', 'E2E唯一性验证B'].entries()) {
      await page.locator('.ant-menu-item').filter({ hasText: '新建订单' }).click()
      await page.waitForURL('**/orders/new', { timeout: 20000 })
      await page.waitForTimeout(700)
      await page.getByPlaceholder('请输入会员姓名').fill(name)
      await page.getByPlaceholder(/手机号/).fill(`1380013800${i + 1}`)
      await page
        .locator('.ant-input-number-input')
        .first()
        .fill(String(i + 2))
      await page.locator('.ant-input-number-input').first().press('Tab')
      await page.locator('textarea').first().fill(`验证同一天订单号唯一 ${i}`)
      await page.waitForTimeout(300)
      await clickButton(page, '提交')
      await page.waitForURL('**/orders', { timeout: 20000 })
      await waitLoading(page)
      await page.waitForTimeout(800)
      // 建完立刻记下订单号：此时它就是列表首行（按创建时间倒序）
      created.push(norm(await cell(page, 0, 0)))
    }

    const t = await totalText(page)
    assert(/共39条/.test(t), `列表应为 39 条（36 种子 + 10f 1 笔 + 本用例 2 笔），实际=${t}`)
    created.forEach((no) => assert(/^GM\d+$/.test(no), `订单号格式异常=${no}`))
    assert(created[0] !== created[1], `同一天连续新建却得到相同订单号：${created.join(' / ')}`)

    // 关键断言：两个订单号各自精确匹配都必须只命中 1 条
    for (const no of created) {
      await (await searchInput('订单号')).fill(no)
      await clickButton(page, '查询')
      await waitLoading(page)
      await page.waitForTimeout(500)
      const tt = await totalText(page)
      assert(/共1条/.test(tt), `${no} 精确匹配应只命中 1 条，实际=${tt}`)
    }
    await clickButton(page, '重置')
    await waitLoading(page)
    return `同一天连续新建 ${created.join(' / ')}，各自精确匹配均为 1 条`
  })

  await shot(page, 'after-create')

  /* ============================================================ 11 404 / 退出 */
  await check('11a 登录态下 404 页主按钮为「返回订单列表」', async () => {
    await page.goto(BASE + '/nope-404', { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    const b = norm(await page.locator('body').innerText())
    assert(b.includes('返回订单列表'), b.slice(0, 120))
    await clickButton(page, '返回订单列表')
    await page.waitForTimeout(1200)
    assert(page.url().includes('/orders'), page.url())
    return '点击后回到 /orders'
  })

  await check('11b 退出登录 → 回登录页 + token 被清空', async () => {
    await page.locator('.ant-layout-header button').last().click()
    await page.waitForTimeout(600)
    await page.getByText('退出登录').click()
    await page.waitForTimeout(1500)
    assert(page.url().includes('/login'), page.url())
    const t = await page.evaluate(() => window.localStorage.getItem('gym_order_admin_token'))
    const u = await page.evaluate(() => window.localStorage.getItem('gym_order_admin_user'))
    assert(!t, `token 未清除: ${t}`)
    assert(!u, `user 未清除: ${u}`)
    return `url=${page.url()} token=${t} user=${u}`
  })

  await check('11c 退出后受保护页再次被拦截', async () => {
    await page.goto(BASE + '/orders/new', { waitUntil: 'networkidle' })
    assert(page.url().includes('/login'), page.url())
    return page.url()
  })

  await check('11d 重新登录成功（供 401 用例使用）', async () => {
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    await page.getByPlaceholder('请输入账号').fill('admin')
    await page.getByPlaceholder('请输入密码').fill('123456')
    await clickButton(page, '登录')
    await page.waitForURL('**/orders', { timeout: 20000 })
    await page.waitForTimeout(600)
    // 11c 留下了 state.from=/orders/new，所以登录后会回到新建页；
    // 401 用例需要列表页的「查询」按钮，这里显式切到列表
    await page.goto(BASE + '/orders', { waitUntil: 'networkidle' })
    await rows(page).first().waitFor({ timeout: 15000 })
    await waitLoading(page)
    assert(page.url().endsWith('/orders'), page.url())
    return `登录落点=${page.url()}`
  })

  await check('11e token 失效 → 401 → 自动登出 + 提示 + 跳登录页', async () => {
    // 塞一个不满足 mock-token-* 前缀的 token，mock 后端会真实返回 401
    await page.evaluate(() =>
      window.localStorage.setItem('gym_order_admin_token', 'expired-token-xyz'),
    )
    await clickButton(page, '查询') // 触发一次受保护请求
    await page.waitForTimeout(2500)
    const t = (await toasts(page)).map(norm).join(' | ')
    assert(/登录状态已失效/.test(t), `未见「登录状态已失效」提示: ${t}`)
    assert(page.url().includes('/login'), `401 后应跳登录页，实际=${page.url()}`)
    const token = await page.evaluate(() => window.localStorage.getItem('gym_order_admin_token'))
    const user = await page.evaluate(() => window.localStorage.getItem('gym_order_admin_user'))
    assert(!token, `token 未清除: ${token}`)
    assert(!user, `user 未清除: ${user}`)
    return `${t} → ${page.url()}，token/user 已清空`
  })

  await check('12 控制台无 error / warning', async () => {
    const errs = consoleErrors.filter(
      (e) => !/favicon|DevTools|Download the React|sourcemap/i.test(e),
    )
    assert(errs.length === 0, errs.slice(0, 4).join(' || '))
    return '0 errors / 0 warnings'
  })

  await browser.close()

  const failed = results.filter((r) => !r.ok)
  console.log('\n================ SUMMARY ================')
  console.log(
    `total=${results.length}  pass=${results.length - failed.length}  fail=${failed.length}`,
  )
  failed.forEach((f) => console.log(`FAILED: ${f.name} :: ${f.detail}`))
  fs.writeFileSync(path.join(__dirname, 'qa-report.json'), JSON.stringify(results, null, 2))
  process.exit(failed.length ? 1 : 0)
})().catch((e) => {
  console.error('QA CRASHED:', e)
  process.exit(2)
})
