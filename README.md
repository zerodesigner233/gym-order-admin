# 健身房会员办卡订单管理模块

> 仓库名：**`gym-order-admin`**
> 简介：Gym membership card order management admin SPA — a front-end take-home exercise
> covering the full membership-card order lifecycle: 待审核 → 待制卡 → 待寄卡 → 已完成,
> plus the branch states 已到期 (expired, not renewed) and 已取消 (cancelled by customer).

连锁健身房「会员办卡订单」管理后台的前端实现，用于跟进会员办卡订单的全生命周期：
**待审核 → 待制卡 → 待寄卡 → 已完成**，以及分支态 **已到期**（卡到期未续费）与 **已取消**（客户撤单）。

技术栈：React 18 + Vite 7 + react-router v7 + antd v5 + axios + zustand + dayjs + ahooks（JavaScript，ESLint + Prettier）。

一句话概括：这是一个**纯前端**项目 —— 「模拟后端」以自定义 axios adapter 实现，跑在 axios 主流程
（请求拦截器 → adapter → 响应拦截器）之内，因此 token 注入、统一错误与 401 处理等真实链路都能被完整验证；
接真实后端时只需删掉 `src/api/request.js` 里 `adapter: mockAdapter` 一行，业务代码零改动。

---

## 一、启动步骤

环境要求：**Node.js >= 20.19**（开发使用 Node v24.15.0，npm 11.12.1）。

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务（默认 http://127.0.0.1:5173）
npm run dev

# 3. 生产构建 + 本地预览构建产物
npm run build
npm run preview

# 4. 静态检查与代码格式化
npm run lint          # ESLint
npm run lint:fix      # ESLint 自动修复
npm run format        # Prettier 写入
npm run format:check  # Prettier 校验（CI 友好）

# 5. 端到端自测（需要先起 dev server，另开一个终端）
npx playwright install chromium   # 首次需要，下载浏览器
npm run test:e2e                  # 真实点击跑全流程，产物在 e2e/shots、e2e/downloads
```

**登录说明**：模拟登录，任意**非空**账号 + 密码即可进入（与需求「任意账号密码均可登录成功」一致，不设长度下限）。例如 `admin / 123456`。

**数据说明**：本项目自带「模拟后端」，数据存放在浏览器内存中。写操作（新建 / 续卡 / 撤单）会真实修改内存数据，
后续查询可以查到变更结果；**刷新页面即重置为 36 条初始种子数据**。

---

## 二、目录结构

```
.
├── index.html                     # Vite 入口 HTML
├── vite.config.js                 # Vite 配置
├── eslint.config.js               # ESLint 9 flat config（含 prettier 冲突关闭）
├── .prettierrc.json               # Prettier 配置（无分号 / 单引号 / 100 列）
├── package.json
├── docs/
│   └── requirements.md            # 试题要求原文 + 逐条需求符合性自查表
├── e2e/
│   └── qa.cjs                     # 端到端自测脚本（Playwright，真实点击，61 条断言）
└── src/
    ├── main.jsx                   # 应用入口：ConfigProvider(zh_CN) + AntdApp + BrowserRouter + GlobalProviders
    ├── App.jsx                    # 路由表 + 页面级懒加载
    ├── constants/
    │   └── order.js               # 领域常量：状态枚举/文案/颜色、Tab 定义、定价规则、金额四舍五入
    ├── api/
    │   ├── request.js             # axios 实例：baseURL、token 注入、统一错误与 401 处理
    │   ├── auth.js                # 登录接口
    │   └── order.js               # 订单相关接口（列表 / 导出全量 / 新建 / 批量续卡 / 批量撤单）
    ├── mock/
    │   ├── db.js                  # 内存数据服务层：36 条种子数据 + 查询 / 写操作
    │   └── server.js              # 模拟服务端：实现为自定义 axios adapter
    ├── stores/
    │   ├── authStore.js           # 登录态（zustand + localStorage 持久化）
    │   └── orderSelectionStore.js # 跨页勾选状态（{[id]: order} Map）
    ├── hooks/
    │   └── useOrderQuery.js       # 列表查询逻辑抽象成自定义 hook（含竞态防护）
    ├── utils/
    │   ├── money.js               # 金额千分位格式化（区分 null / 0）
    │   ├── csv.js                 # CSV 生成与下载（BOM、转义、公式注入防护）
    │   ├── storage.js             # localStorage 读写封装
    │   ├── errorLog.js            # catch 统一出口：只上报「预期外」错误，预期内的不重复打扰用户
    │   └── appBridge.js           # 向模块级代码注入 antd message / router navigate 的桥接层
    ├── components/
    │   ├── AppLayout.jsx          # 后台布局：左侧菜单 + 顶栏 + 面包屑 + 内容区
    │   ├── RequireAuth.jsx        # 路由守卫
    │   └── GlobalProviders.jsx    # 绑定 message / navigate，路由切换回顶
    ├── styles/
    │   └── global.css             # 全局样式（金额右对齐、等宽数字等）
    └── pages/
        ├── Login/index.jsx        # 登录页
        ├── OrderList/
        │   ├── index.jsx          # 订单列表页（Tab / 搜索 / 表格 / 批量操作 / 导出）
        │   └── components/        # 续卡弹窗、导出按钮等子组件
        ├── OrderCreate/index.jsx  # 新建订单页
        └── NotFound/index.jsx     # 404 页
```

---

## 三、请求层与状态管理设计简述

### 3.1 请求层：`src/api/request.js`

单例 axios 实例，三个职责：

| 环节               | 实现                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| baseURL            | `import.meta.env.VITE_API_BASE_URL \|\| '/api'`                                                       |
| 请求拦截器         | 从 localStorage 读 token，注入 `Authorization: Bearer <token>`；无 token 时主动删除该 header          |
| 响应拦截器（成功） | 业务约定 `code === 0` 为成功；`code !== 0` 视为业务错误，统一 `message.error` 并 reject 出 `BizError` |
| 响应拦截器（失败） | 按 `status` 归一化文案（404 / 500 / 超时 / 断网）；**401 不弹通用错误**，改由登录态统一处理           |

**401 处理链路**：`response 拦截器 → runUnauthorizedHandler() → authStore.logout() + toast + navigateTo('/login')`。
并发 401 用模块级门闩去重，避免多个请求同时失败时弹多次提示、跳多次页面。

### 3.2 模拟后端为什么用「自定义 axios adapter」

`src/mock/server.js` 把模拟接口实现为一个 axios adapter，而不是拦截器或 mock 库。原因是位置：

```
业务代码 → 请求拦截器（注入 token） → 【mockAdapter：路由 + 内存数据 + 随机延迟】
        → 响应拦截器（统一错误 / 401） → 业务代码
```

adapter 位于**请求拦截器之后、响应拦截器之前**，所以 token 注入、错误归一化、401 跳转这些真实链路都能完整跑到，
而不是绕过 axios 主流程另起一套 —— 也就是说模拟环境下验证过的就是真实链路。
接后端时只需删除 `request.js` 里的 `adapter: mockAdapter` 一行，业务代码零改动。

模拟接口清单（均带 180–460ms 随机延迟，让 loading 可见）：

| 方法 | 路径                   | 说明                                                                          |
| ---- | ---------------------- | ----------------------------------------------------------------------------- |
| POST | `/auth/login`          | 任意非空账号密码返回 mock token 与用户信息                                    |
| GET  | `/orders`              | 分页 + 筛选（`page` `pageSize` `tab` `orderNo` `memberName`），按创建时间倒序 |
| GET  | `/orders/exportable`   | 同样筛选条件但**不分页**，供导出使用                                          |
| POST | `/orders`              | 新建订单，初始状态「待审核」                                                  |
| POST | `/orders/batch-renew`  | 批量续卡：年限累加、金额累加、状态回到「待审核」                              |
| POST | `/orders/batch-cancel` | 批量撤单：状态变为「已取消」                                                  |

除 `/auth/login` 外所有接口都会校验 `Authorization: Bearer mock-token-*`，用于真实地触发 401 分支。

### 3.3 状态管理：两个职责单一的 zustand store

**为什么不用一个全局 store？** 登录态和列表勾选的生命周期完全不同：前者跟随整个会话（刷新要恢复），
后者跟随一次查询（切换筛选就该清空）。混在一起会产生「刷新后残留旧勾选」这类脏状态。

**`useAuthStore`**（`src/stores/authStore.js`）

- `token` / `user` / `isLoggedIn()` / `login(username, password)` / `logout()`。
- **token 的唯一可信来源是 localStorage**：store 的初始值直接读 storage，登录成功后同时写 store 和 storage，
  退出登录同时清两者。这样避免了「store 说已登录、storage 里没有 token」的假登录态。
- `login()` 返回 `{ ok, message?, user? }` 而不是抛异常，方便页面把错误挂到表单上。
- 模块顶层调用 `setUnauthorizedHandler(...)` 注册 401 处理，因此只要该模块被加载过一次就一定生效。

**`useOrderSelectionStore`**（`src/stores/orderSelectionStore.js`）

- 存的是 `{ [id]: order }` 而不是 `rowKeys[]`。因为跨页保留时，续卡/撤单确认弹窗需要展示**不在当前页**的订单号，
  只存 id 拿不到订单对象。
- 翻页 / 重新查询**不清空**（加分项：跨页保留勾选）；只调用 `syncVisibleRows(rows)` 把新一页的数据合并进缓存并刷新已选项。
- 切换 Tab 或提交/重置搜索时才 `clear()` —— 筛选条件变了，原选择在新的结果集里已失去意义。

**路由守卫**：`RequireAuth` 未登录时 `<Navigate to="/login" replace state={{ from }}>`，
登录成功后跳回 `from` 指向的原页面，而不是一律回列表。

### 3.4 列表查询抽象：`useOrderQuery`

`src/hooks/useOrderQuery.js` 把「Tab / 搜索 / 分页 / 请求 / 竞态防护」收敛到一个 hook。
关键点：所有会导致结果集变化的入口都走同一套 setter，页码重置规则写在 hook 内部而不是散落在页面里。

---

## 四、开发过程中最难的问题

### 4.1 自定义 axios adapter 丢失查询参数（最花时间的一个）

**现象**：列表接口返回 `total` 永远是 36，`tab=ongoing` 也是 36，订单号精确搜索完全不起作用。

**定位**：一开始怀疑是 `queryOrders` 的筛选逻辑写错了，检查了 `params` 传参、mock 路由匹配、内存数据 —— 都没问题。
最后在 adapter 里打日志发现 `config.url` 只有 `'/orders'`，后面根本没有 `?page=1&pageSize=5`。

**原因**：axios 内置的 `xhr` / `http` adapter 会自己把 `config.params` 拼到 URL 上再发出去，
而 `dispatchRequest` 阶段不做这件事。**自定义 adapter 拿到的 `config.url` 是「没有查询串」的原始路径，
筛选参数停留在 `config.params` 上**。用拦截器做 mock 时这个问题不会暴露，因为拦截器改的就是 `config.url`。

**解决**：在 adapter 里手工合并 `config.params` 到 `URL.searchParams`，过滤掉 `undefined / null / ''`：

```js
const url = new URL(config.url || '/', MOCK_ORIGIN)
Object.entries(config.params || {}).forEach(([key, value]) => {
  if (value !== undefined && value !== null && value !== '')
    url.searchParams.append(key, String(value))
})
```

**验证**：用 `vite-node` 写一次性脚本直接跑 mock 层，确认 `tab=ongoing → 18`、错误订单号 → `0`、分页切片正确，
之后才接页面。**教训：模拟数据层要单独验，不要等页面写完才发现筛选是坏的。**

### 4.2 `null` 与 `0` 的金额显示

需求同时要求「费用为 0 要正常显示 0.00」和「接口偶尔返回空值」。
而 JS 里 `Number(null) === 0`、`Number('') === 0`，如果直接 `Number(value).toFixed(2)`，空值会被静默显示成 `0.00`，
财务会以为这笔订单是 0 元而不是「金额未知」。

**解决**：`formatMoney` 先用 `isBlank`（严格判 `null / undefined / '' / NaN`）拦截空值返回占位符 `-`，
只有真正有值的数字才走 `toLocaleString('zh-CN', { minimumFractionDigits: 2 })`；`0` 走到格式化分支自然得到 `0.00`。
导出的 CSV 则用另一个开关让空值落成**空单元格**（而不是 `-` 或 `0.00`），同样是为了不让财务把「未知」当成「零」。

**补充（复查时才发现的同一个坑）**：上面这个 `isBlank` 守卫当初只加在了**显示层**，
**定价函数** `calcCreateAmount` / `calcRenewAmount` 只写了 `if (!Number.isFinite(Number(years))) return null`。
但 `Number.isFinite` 只挡得住 `NaN` 和 `±Infinity` —— `Number(null)` 和 `Number('')` 都等于 `0`，
于是「年限被清空」会被当成「0 年」，续卡弹窗显示 `¥0.00`（看起来像免费续卡）。
同一屏里还会出现 `原价 ¥-` 挨着 `应付费用 ¥0.00` 的自相矛盾，因为前者走 `formatMoney`、后者不走。
连带两处也一并修了：

- 两个定价函数补 `isBlank` 前置守卫，合法数值行为不变（已用 `vite-node` 逐值核对 1/2/3/4/5/6/10）
- 弹窗合计 `roundMoney(feePerOrder * orders.length)` 在 `feePerOrder` 为 `null` 时会算出 `0`（`null * n === 0`），
  改为 `isBlank(feePerOrder) ? null : ...`，让合计与单笔统一显示 `-`

回归断言 07f2 锁住「清空年限 → 金额显示 `-` 而非 `¥0.00`」。
这条也说明了一个通用原则：**空值守卫要加在数据产生处，不能只加在渲染处** ——
只挡住显示，错误会从计算结果里继续流向下游。

### 4.3 拦截器/store/组件之间的循环依赖

axios 响应拦截器要「清登录态 + 跳登录页 + 弹提示」，这三件事分别住在 `authStore`、`react-router`、`antd` 里。
如果拦截器直接 `import authStore`，而 `authStore` 又要 `import api`，就形成环。

**解决**：三级拆解 + 一个桥接层 `src/utils/appBridge.js`：

1. `utils/storage.js` —— 零依赖，拦截器直接读 token（不需要碰 store）。
2. `utils/appBridge.js` —— 模块级 ref。`bindToast` / `bindNavigator` 由 React 组件 `GlobalProviders`
   在渲染后注入真实引用（这样还能拿到带 ConfigProvider 主题上下文的 `message`，而不是静态 `message`）；
   `setUnauthorizedHandler` 由 `authStore` 在模块顶层注册。
3. `main.jsx` 副作用 `import './stores/authStore'` —— 保证 401 处理函数一定被注册。

依赖方向因此是单向的：`组件 → appBridge ← 拦截器 / store`，无环。

### 4.4 桥接层绑定错形状，导致所有错误提示静默失效（最隐蔽的一个）

**现象**：端到端点「查询」时把 token 换成失效值，token 确实被清了、页面也跳回了登录页，
**但「登录状态已失效，请重新登录」这条提示永远不出现**。进一步测其它错误路径发现：
业务错误（HTTP 200 + `code !== 0`）、404、500、超时、断网——**拦截器统一弹的所有错误提示全部不显示**。

**原因**：`appBridge` 约定绑定的是「带 `.message` 的对象」：

```js
export const toast = {
  warning(content) {
    toastApi?.message.warning(content) // ← 期待 toastApi.message
  },
}
```

而 `GlobalProviders` 绑的是 antd `App.useApp()` 返回值里的**裸 message 实例**：

```js
const { message } = AntdApp.useApp()
bindToast(message) // ← 传错了：message.message 是 undefined
```

于是 `toastApi?.message` 为 `undefined`，再取 `.warning` 直接抛
`TypeError: Cannot read properties of undefined`。而 `toastApi?.` 的可选链把「没绑定」这一层吞掉了，
异常发生在 Promise 链里，控制台也不会报错——**整个错误提示体系静默死掉，日志干净得像一切正常**。

> 401 那次跳转之所以「看起来正常」，是因为 `logout()` 先把 token 清了，
> `RequireAuth` 读到 `token === null` 自行做了重定向，掩盖了后面 `toast.warning` 已经抛异常的事实。

**解决**：绑定形状与消费形状对齐——`bindToast({ message })`。

**验证**：补了一条端到端用例（篡改 token → 触发受保护请求 → 断言提示文案 + 跳转 + storage 清空），
它正好覆盖这条路径；并用 `page.evaluate` 动态 import 直接探测桥接层，确认 `toast.success` 不再抛。

**教训**：`a?.b.c` 里 `?.` 只保护了 `a`，`b.c` 照样会抛。跨模块传引用时，
「绑定端传什么形状」和「消费端取什么形状」必须当成契约写下来；否则类型不匹配不会报错，只会「什么都不发生」。

### 4.5 订单号前缀少写一个 `GM`，当天新建的订单全部撞号（独立复查才发现）

**现象**：端到端自测一直全绿，新建订单看起来也完全正常。独立复查时用 `vite-node` 连续调四次 `createOrder`，
拿到四个一模一样的 `GM202610020001`；再按这个号去列表精确匹配，命中 **4 条**而不是需求 3.2 要求的 1 条。

**原因**：按「当天已有多少笔」推序号时，前缀少写了一个 `GM`：

```js
const datePart = '20261002' // 只有日期
const seq = orders.filter((o) => o.orderNo.startsWith(datePart)).length + 1 // ← 永远筛出 0 条
orderNo: `GM${datePart}${pad(seq, 4)}` // ← 订单号却带 GM 前缀
```

`orderNo` 形如 `GM202610020001`，`datePart` 是 `20261002`，
`"GM202610020001".startsWith("20261002")` **恒为 false** —— 筛选永远返回空数组，
`seq` 恒等于 1，于是当天每一笔新建订单都拿到 `GM{date}0001`。
种子数据走的是另一套生成逻辑、自带去重循环，所以一直查不出问题；这个 bug 只在「同一天连续新建」时暴露。

**解决**：匹配时补上 `GM` 前缀，再加一层 `while` 兜底（历史数据有空洞时也不撞号）：

```js
const prefix = `GM${datePart}`
let seq = orders.filter((o) => o.orderNo.startsWith(prefix)).length + 1
let orderNo = `${prefix}${pad(seq, 4)}`
while (orders.some((o) => o.orderNo === orderNo)) {
  seq += 1
  orderNo = `${prefix}${pad(seq, 4)}`
}
```

**回归**：新增断言 10g「同一天连续新建的订单号必须唯一」。这里还踩到一个**测试自身的坑** ——
模拟数据在浏览器内存里，**整页刷新即重置为 36 条种子数据**。最初用例在两笔之间用 `page.goto()` 跳页，
第二笔于是又从 `0001` 开始算，测到的成了「各自刷新后新建」而不是「同一天连续新建」，
用例通过但什么都没锁住。改成点左侧菜单走客户端路由（不刷新页面）才真正覆盖到场景。

**教训**：

1. 用 `startsWith` 做前缀匹配时，被匹配串与匹配串的**格式必须完全对齐**。
   这里错了一个字符，而它的表现是「静默返回空集合」——不抛错、不告警，只在写数据时才炸。
2. **读路径和写路径往往是两套代码**。种子数据正确不代表新建逻辑正确，写路径必须单独验。
3. 回归断言写完要**回退修复、确认它真的会失败**，否则分不清「测试通过」和「测试没在测」。

### 4.6 其它值得一提的取舍

- **批量操作的失败语义**：接口对「状态不允许」的记录返回 HTTP 200 + `rejected[]`，而不是抛错。
  前端必须自己检查 `rejected` 并把订单号展示给用户，否则会静默丢数据。
- **成功/失败的提示归属**：拦截器已经统一弹错误提示了，所以页面里**不再**对服务端错误重复 `message.error`，
  只提示自己的业务结果（成功汇总、状态不合法警告），避免一次失败弹两条。
- **需求自相矛盾处**：需求写「按创建时间升序排列，保证最新创建的订单显示在最前面」——
  升序会把最旧的放最前。这里按**明确表达的意图**实现为**倒序（最新在前）**，并在常量处加了注释说明。
- **catch 里的错误该记到哪一层**：`catch` 会把**所有**异常一并吞掉，包括我们自己代码里的 TypeError
  （读 undefined 的属性、对 null 直接 `.map`）。这类错误既没人提示、也几乎没有别的暴露途径，
  一旦发生就表现为「点了没反应」的灵异 bug。所以页面层的空 `catch` 与 `useOrderQuery` 的
  `onError` 统一走 `utils/errorLog.js`：
  **预期内**的失败（业务码非 0、HTTP 4xx/5xx、超时、断网）已经被响应拦截器弹过提示，静默兜住即可；
  只有**预期外**的错误才落 `console.error` 并带上出错位置。
  顺带一个反直觉的点：校验失败不能和提交失败共用一个 `catch` ——
  `form.validateFields()` 抛出的是 `{ errorFields }` 普通对象而非 `Error`，
  混在一起会被误判成「预期外的错误」而污染控制台，所以 `RenewModal` 那里拆成了两段。

---

## 五、Part 5：需求理解与实现

### 5.1 业务方原话

> 「列表页帮我们加个导出功能吧，把订单数据导出来给财务对账用，金额格式弄得好看一点。
> 对了，上次权限评审的时候说过，有些状态的订单是不能随便导出的，具体哪些你看着办。」

### 5.2 我会先向业务方澄清的问题清单

1. **导出范围是什么？** 导出「当前这一页」「当前筛选条件下的全部数据」还是「用户勾选的订单」？三者对财务的含义完全不同（对账一般要全量）。
2. **「金额格式弄得好看一点」具体指什么？** 千分位逗号？带 `¥` 符号？两位小数？单位用元还是万元？表头要不要写「订单金额(元)」？
3. **「有些状态不能导出」具体是哪几个状态？** 是否按角色（财务 / 店长 / 销售）或门店维度区分？
4. **被限制的记录怎么处理？** 静默跳过、导出但标记为「待确认」，还是整体阻止导出并提示？
5. **导出是否需要留痕？** 谁在什么时候导了哪些订单？是否需要审批、水印或操作日志？（纯前端做不到，得后端支持）
6. **数据量级是多少？** 最多导出多少行？超过阈值（比如 1 万行）是否要转成异步任务 + 下载中心 + 邮件通知？
7. **是否包含个人信息？** 手机号是否要脱敏？导出文件是否需要加密或加水印？
8. **文件格式是 CSV 还是 Excel(.xlsx)？** 财务那边日常用什么工具打开？CSV 打开中文需要 BOM，我会加，但想确认习惯。
9. **是否需要汇总信息？** 总金额、笔数、各状态笔数是否要随文件一起给出（对账通常要）？
10. **导出过程中订单状态发生变化怎么办？** 以导出那一刻的快照为准，还是需要保证一致性？

### 5.3 我的实现假设（逐条）

| #   | 假设                                                                                                                                                                                                       | 实现位置                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| A1  | 导出范围 = **当前筛选条件（Tab + 订单号 + 会员姓名）下的全部订单，不分页**。不是当前页，也不是勾选项 —— 对账要的是符合口径的全量。                                                                         | `fetchAllOrdersForExport`                     |
| A2  | 「金额格式好看」= **千分位 + 固定两位小数，不带货币符号**，单位为元，表头写明「订单金额(元)」。CSV 里放 `¥` 会让部分财务工具解析失败。                                                                     | `formatMoney`                                 |
| A3  | **允许导出**：待制卡、待寄卡、已完成、已到期（已确认收款、未退款的订单）。**禁止导出**：待审核（尚未最终确认，可能被驳回退款）、已取消（将走退款流程，计入对账会造成错账）。                               | `EXPORTABLE_STATUSES`                         |
| A4  | 被禁止的记录**不静默丢弃**：导出前先统计，提示被排除的订单号与原因；若一条都不可导出则直接阻止并提示。                                                                                                     | 导出前校验逻辑                                |
| A5  | 权限过滤**叠加在筛选之后**：先按 Tab 缩小范围，再按可导出状态过滤。这样「全部」Tab 下被排除的是全量待审核/已取消。                                                                                         | 同上                                          |
| A6  | 前端直接生成 CSV，文件名 `订单导出_{当前Tab名}_{时间戳}.csv`，写入 UTF-8 **BOM** 保证 Excel 双击打开不乱码。                                                                                               | `utils/csv.js`                                |
| A7  | CSV 中**空金额落成空单元格**，既不写 `0.00` 也不写 `-`，避免财务把「未知」当成「零」。                                                                                                                     | 导出行映射                                    |
| A8  | 做 **CSV 公式注入防护**：以 `= + - @` 开头的文本前置单引号，防止订单备注被 Excel 当公式执行。                                                                                                              | `utils/csv.js`                                |
| A9  | 金额合计这类汇总**本次不做**（问题 9 未澄清前不敢替财务做主），但预留了 `rows` 数组结构，后续加一行汇总记录成本很低。                                                                                      | ——                                            |
| A10 | 单次导出行数上限 **5000 条**，超过则提示缩小筛选范围（避免浏览器一次性生成超大文件卡死）。                                                                                                                 | 导出前校验逻辑                                |
| A11 | **权限与留痕不在前端实现**（问题 5 未澄清）。前端只做状态白名单，真实的「谁能导出、导出过什么」需要后端在网关层兜底 —— 这是已知遗留风险，README 明确记录以示诚实。                                         | ——                                            |
| A12 | 导出同样受**登录态保护**：token 失效（401）时导出会失败并跳回登录页，与其它操作一致。                                                                                                                      | 拦截器统一处理                                |
| A13 | 导出采用**快照语义**（问题 10）：一次拉取、前端本地生成 CSV，文件内容以「点击导出那一刻」的数据为准。生成过程不再回查接口，因此不存在导出中途状态漂移；代价是导出期间发生的续卡/撤单不会体现在这份文件里。 | `ExportButton` 单次 `fetchAllOrdersForExport` |
| A14 | 手机号**按明文导出**（问题 7）：财务对账往往需要能直接联系的号码，故不默认脱敏。**这是一个待确认的合规风险**——个人信息明文落盘且导出无留痕，若业务方要求脱敏，改 `toExportRow` 一处即可（见已知限制 L4）。 | `toExportRow` 的 `phone` 字段                 |

---

## 六、开发过程中使用的工具

| 工具                                      | 用在什么环节                                                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node.js 24.15.0 / npm 11**              | 依赖安装、运行脚本、构建                                                                                                                                                   |
| **Vite 7**                                | 开发服务器（HMR）、生产构建                                                                                                                                                |
| **ESLint 9（flat config）**               | 静态检查：未使用变量、hooks 规则、import 规范                                                                                                                              |
| **Prettier 3**                            | 代码格式化，统一风格；`format:check` 作为提交前的门禁                                                                                                                      |
| **vite-node**                             | 写一次性脚本脱离浏览器直接跑 mock 数据层，验证分页 / 筛选 / 写操作（第四节 4.1 就是靠它定位的）                                                                            |
| **Chrome DevTools**                       | 检查 localStorage 中的 token、Network 面板确认拦截器链路                                                                                                                   |
| **Playwright（浏览器自动化）**            | 端到端自测：登录 → Tab 切换 → 搜索 → 批量续卡 → 撤单 → 导出 CSV → 新建订单 → 路由守卫，并截图留证。脚本已纳入版本管理（`e2e/qa.cjs`，`npm run test:e2e`），当前 59/59 通过 |
| **AI 编码助手（Claude Code）** | 脚手架与基础设施层实现、页面代码生成、代码走查与自检、README 撰写。**如实说明：本项目的代码由 AI 辅助编写**，需求拆解、架构取舍、假设判断与最终验证由人确认                |
| **Git**                                   | 按正常工作节奏分多次提交（脚手架 → 页面 → 文档）                                                                                                                           |

---

## 七、功能对照表

| 需求                                                                                          | 实现位置                                                |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Vite 从零初始化 React 项目                                                                    | 项目根目录                                              |
| `/login` `/orders` `/orders/new` + 404                                                        | `src/App.jsx`                                           |
| 左侧菜单 + 顶栏（用户名 / 退出）+ 面包屑 + 内容区                                             | `src/components/AppLayout.jsx`                          |
| 任意账号密码登录、mock token 存 localStorage、zustand 管理登录态                              | `src/stores/authStore.js`                               |
| 路由守卫、退出登录清 token 回登录页                                                           | `src/components/RequireAuth.jsx` + `authStore.logout`   |
| axios 实例：baseURL / token 注入 / 统一错误 / 401 跳转                                        | `src/api/request.js`                                    |
| ≥30 条订单、覆盖所有状态、分页与筛选、真实写操作                                              | `src/mock/db.js`（36 条，6 状态各 6 条）                |
| 状态 Tab（进行中含 3 种状态）、切 Tab 回第 1 页                                               | `src/constants/order.js` `ORDER_TABS` + `useOrderQuery` |
| 订单号精确匹配、会员姓名模糊匹配                                                              | `src/mock/db.js` `queryOrders`                          |
| 表格 7 列 + 状态彩色 Tag                                                                      | `src/pages/OrderList/index.jsx`                         |
| 默认按创建时间倒序（最新在前）                                                                | `queryOrders` 内 `sort`                                 |
| 金额千分位、0 显示 0.00、空值容错                                                             | `src/utils/money.js`                                    |
| 批量续卡：仅已到期、列出不合法订单号、1~10 年、实时费用、满 5 年 8 折、年限累加、状态转待审核 | `src/pages/OrderList/` + `mock/db.js` `renewOrders`     |
| 一键撤单：仅待制卡/待寄卡、二次确认列订单号、状态转已取消                                     | `src/pages/OrderList/` + `mock/db.js` `cancelOrders`    |
| 行内「续卡」按钮仅已到期显示，逻辑一致                                                        | `src/pages/OrderList/index.jsx`                         |
| 新建订单表单（姓名 2~30 / 手机号 / 年限 1~10 / 费用只读 / 备注 200）+ 成功后跳列表            | `src/pages/OrderCreate/index.jsx`                       |
| Part 5 导出 CSV + 状态白名单 + 金额格式                                                       | `src/pages/OrderList/` + `src/utils/csv.js`             |
| 加分项：跨页保留勾选                                                                          | `src/stores/orderSelectionStore.js`                     |
| 加分项：列表查询抽象为自定义 hook                                                             | `src/hooks/useOrderQuery.js`                            |

---

## 八、已知限制与后续可做

按「**谁能解决**」分三组：后端依赖的（纯前端做不到）、现在就能做的（纯前端，成本已估）、测试债。

### 8.1 依赖后端（前端无法自行解决）

| #   | 限制                                  | 前端已做的兜底                                                                                            |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| L1  | **导出留痕与角色权限**（假设 A11）    | 前端只做状态白名单。「谁有资格导出、导出过什么」无法在浏览器内定论，需后端在网关层鉴权并落操作日志        |
| L2  | **导出未做异步任务**（问题 6 未澄清） | 单次上限 5000 行（假设 A10）拦在浏览器端，避免一次性生成超大文件卡死主线程；超大规模需后端生成 + 下载中心 |

### 8.2 现在就能做（纯前端）

| #   | 待办                         | 成本 | 说明                                                                                                        |
| --- | ---------------------------- | ---- | ----------------------------------------------------------------------------------------------------------- |
| L3  | **CSV 汇总行**（假设 A9）    | 很低 | `utils/csv.js` 的 `buildCsv(columns, rows)` 已是数组结构，加一行汇总记录即可；问题 9 未澄清前不替财务定口径 |
| L4  | **导出手机号未脱敏**         | 低   | 见下方说明 —— **这是当前最值得补的一条**                                                                    |
| L5  | **数据在内存中，刷新即重置** | 中   | 换浏览器存储；两种方案代价不同，见下方说明                                                                  |

**L4 · 手机号明文导出（合规风险，不是体验问题）**

5.2 的问题 7 明确问了「手机号是否要脱敏、文件是否要加密或加水印」。当前按**假设 A14** 保持明文导出 ——
`ExportButton.jsx` 的 `EXPORT_COLUMNS` 把 `phone` **原样**写进 CSV（形如 `15196605013`）。
个人信息明文落盘、且导出无留痕，是这份实现里风险最高的一处 —— 优先级高于下面所有体验类优化。
改法很小：在 `toExportRow` 里对 `phone` 掩码为 `151****5013`，并同步调整 09a 断言。
但**是否真要脱敏需业务方确认**：财务对账时可能恰恰需要能联系的明文手机号，这正是 5.2 问题 7 的价值。

**L5 · 持久化的两种方案（代价不同，别照着旧措辞理解）**

| 方案                         | `db.js` 函数签名                          | `server.js`                               | 页面         |
| ---------------------------- | ----------------------------------------- | ----------------------------------------- | ------------ |
| **localStorage**（同步 API） | **完全不变**，只改模块初始化与写后回写    | 无感                                      | 无感         |
| **IndexedDB**（异步 API）    | **要改成返回 Promise**（`db.js:215-346`） | 调用点需加 `await`（`server.js:140-195`） | **仍然无感** |

两者页面都零改动，因为页面只走 `api 层 → axios adapter`，从不直接 `import` `db.js`。
差别在 db 层：localStorage 是同步 API，读写签名不用动，本数据集（36 条）远用不满约 5MB 配额，最省事；
IndexedDB 必须把那几个函数的返回值异步化。**所以「接口签名不变」只对 localStorage 成立。**

### 8.3 测试债

**L6 · 未写单元测试。** 质量目前靠「mock 层用 vite-node 脚本验证 + Playwright 端到端点击验证」保证，
其中端到端脚本已提交到 `e2e/qa.cjs`（`npm run test:e2e`，61 条断言，随源码一起交付以保证结论可复现）。

若要补，按「纯函数 + 边界值明确 + 当前无自动化覆盖」排序：

1. `utils/money.js` —— `null` / `0` / 负数 / 超大数（4.2 记录的 `null` 与 `0` 的坑值得锁死）
2. `constants/order.js` 的 `calcRenewAmount` —— 4 年（无折扣）与 5 年（8 折）的边界
3. `utils/csv.js` —— 逗号 / 引号 / 换行 / 公式注入转义

上面三条都是**纯函数**。`useOrderQuery` 的「页码越界」处理**不满足**这个标准，因此按当前文档口径它属于**不补自动化测试**的合理范畴：

- 不是纯函数 —— 它依赖 `useRequest`、refs 与渲染时序；
- 边界不是数值而是**时序**（两个 `await` 之间不出现中间态），端到端脚本对这种一帧闪烁天生不可靠：
  写过一条 E2E 试图覆盖，实测三次因选择器歧义与前序状态耦合而返工，最终删除；
- 且它**不是需求项** —— `docs/requirements.md` 的 3.1~3.9 唯一涉及页码的是「切 Tab 回第 1 页」，已由 04f 覆盖。

补它的正确形态是引入测试运行器（vitest + jsdom）做 hook 单测，但那会新增依赖与一层验证基建，
超出 `requirements.md` 第九节固定的五档验证方式（lint / format:check / build / vite-node / Playwright），故本次不做。
代码里的处理方式是：clamp 在**同一个 `requestSeqRef` 内重取**一次，先写 `total` 再写 `list`，
由同一个 `try/finally` 关闭 loading —— 不把状态交接给「未来的请求」，因此不依赖后续请求是否真会到来。
