# 健身房会员办卡订单管理模块

连锁健身房「会员办卡订单」管理后台的前端实现，用于跟进会员办卡订单的全生命周期：
**待审核 → 待制卡 → 待寄卡 → 已完成**，以及分支态 **已到期**（卡到期未续费）与 **已取消**（客户撤单）。

技术栈：React 18 + Vite 7 + react-router v7 + antd v5 + axios + zustand + dayjs + ahooks（JavaScript，ESLint + Prettier）。

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
```

**登录说明**：模拟登录，任意非空账号 + 密码（>= 4 位）即可进入。例如 `admin / 123456`。

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

### 4.5 其它值得一提的取舍

- **批量操作的失败语义**：接口对「状态不允许」的记录返回 HTTP 200 + `rejected[]`，而不是抛错。
  前端必须自己检查 `rejected` 并把订单号展示给用户，否则会静默丢数据。
- **成功/失败的提示归属**：拦截器已经统一弹错误提示了，所以页面里**不再**对服务端错误重复 `message.error`，
  只提示自己的业务结果（成功汇总、状态不合法警告），避免一次失败弹两条。
- **需求自相矛盾处**：需求写「按创建时间升序排列，保证最新创建的订单显示在最前面」——
  升序会把最旧的放最前。这里按**明确表达的意图**实现为**倒序（最新在前）**，并在常量处加了注释说明。

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

| #   | 假设                                                                                                                                                                         | 实现位置                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| A1  | 导出范围 = **当前筛选条件（Tab + 订单号 + 会员姓名）下的全部订单，不分页**。不是当前页，也不是勾选项 —— 对账要的是符合口径的全量。                                           | `fetchAllOrdersForExport` |
| A2  | 「金额格式好看」= **千分位 + 固定两位小数，不带货币符号**，单位为元，表头写明「订单金额(元)」。CSV 里放 `¥` 会让部分财务工具解析失败。                                       | `formatMoney`             |
| A3  | **允许导出**：待制卡、待寄卡、已完成、已到期（已确认收款、未退款的订单）。**禁止导出**：待审核（尚未最终确认，可能被驳回退款）、已取消（将走退款流程，计入对账会造成错账）。 | `EXPORTABLE_STATUSES`     |
| A4  | 被禁止的记录**不静默丢弃**：导出前先统计，提示被排除的订单号与原因；若一条都不可导出则直接阻止并提示。                                                                       | 导出前校验逻辑            |
| A5  | 权限过滤**叠加在筛选之后**：先按 Tab 缩小范围，再按可导出状态过滤。这样「全部」Tab 下被排除的是全量待审核/已取消。                                                           | 同上                      |
| A6  | 前端直接生成 CSV，文件名 `订单导出_{当前Tab名}_{时间戳}.csv`，写入 UTF-8 **BOM** 保证 Excel 双击打开不乱码。                                                                 | `utils/csv.js`            |
| A7  | CSV 中**空金额落成空单元格**，既不写 `0.00` 也不写 `-`，避免财务把「未知」当成「零」。                                                                                       | 导出行映射                |
| A8  | 做 **CSV 公式注入防护**：以 `= + - @` 开头的文本前置单引号，防止订单备注被 Excel 当公式执行。                                                                                | `utils/csv.js`            |
| A9  | 金额合计这类汇总**本次不做**（问题 9 未澄清前不敢替财务做主），但预留了 `rows` 数组结构，后续加一行汇总记录成本很低。                                                        | ——                        |
| A10 | 单次导出行数上限 **5000 条**，超过则提示缩小筛选范围（避免浏览器一次性生成超大文件卡死）。                                                                                   | 导出前校验逻辑            |
| A11 | **权限与留痕不在前端实现**（问题 5 未澄清）。前端只做状态白名单，真实的「谁能导出、导出过什么」需要后端在网关层兜底 —— 这是已知遗留风险，README 明确记录以示诚实。           | ——                        |
| A12 | 导出同样受**登录态保护**：token 失效（401）时导出会失败并跳回登录页，与其它操作一致。                                                                                        | 拦截器统一处理            |

---

## 六、开发过程中使用的工具

| 工具                                      | 用在什么环节                                                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node.js 24.15.0 / npm 11**              | 依赖安装、运行脚本、构建                                                                                                                                    |
| **Vite 7**                                | 开发服务器（HMR）、生产构建                                                                                                                                 |
| **ESLint 9（flat config）**               | 静态检查：未使用变量、hooks 规则、import 规范                                                                                                               |
| **Prettier 3**                            | 代码格式化，统一风格；`format:check` 作为提交前的门禁                                                                                                       |
| **vite-node**                             | 写一次性脚本脱离浏览器直接跑 mock 数据层，验证分页 / 筛选 / 写操作（第四节 4.1 就是靠它定位的）                                                             |
| **Chrome DevTools**                       | 检查 localStorage 中的 token、Network 面板确认拦截器链路                                                                                                    |
| **Playwright（浏览器自动化）**            | 端到端自测：登录 → Tab 切换 → 搜索 → 批量续卡 → 撤单 → 导出 CSV → 新建订单 → 路由守卫，并截图留证                                                           |
| **AI 编码助手（Claude Code / OpenCode）** | 脚手架与基础设施层实现、页面代码生成、代码走查与自检、README 撰写。**如实说明：本项目的代码由 AI 辅助编写**，需求拆解、架构取舍、假设判断与最终验证由人确认 |
| **Git**                                   | 按正常工作节奏分多次提交（脚手架 → 页面 → 文档）                                                                                                            |

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

1. **导出留痕与角色权限**未实现（假设 A11），需要后端在网关层补齐。
2. **数据在内存中**，刷新即重置。要做持久化可以把 `src/mock/db.js` 的读写换成 IndexedDB / localStorage，
   接口签名不变，页面零改动。
3. **导出未做异步任务**（问题 6 未澄清）。当前 5000 行上限是浏览器端的兜底，超大规模需要后端生成 + 下载中心。
4. **CSV 未做汇总行**（假设 A9）。
5. **未写单元测试**。本次采用「mock 层用 vite-node 脚本验证 + Playwright 端到端点击验证」的方式保证质量；
   若要补测试，优先级最高的是 `money.js`（null / 0 / 负数 / 超大数）、`calcRenewAmount`（4 年 vs 5 年边界）和
   `csv.js`（逗号 / 引号 / 换行 / 公式注入转义）。
