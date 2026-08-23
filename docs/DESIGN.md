# 北野行 · 设计文档

本文描述第一阶段产品（微信小程序 + H5 演示 + 管理后台）的完整设计：业务目标、领域模型、技术架构、关键流程、数据与安全边界。实现以仓库当前代码为准。

## 1. 产品定位

**北野行**面向北京及周边短途户外：1 / 2 / 3 / 多日线路。用户可以浏览图文详情、按日期拼团报名。个人拼团报名先占座、费用待出行前支付；公司团先占座后由开团方统一支付。平台提供会员价、积分规则、成团后自动匹配导游，以及基于身份证解析的本团人口画像。发起人与后台可解散拼团；用户可取消报名或注销账号。

第一阶段目标：

- 可演示、可本地独立运行（SQLite，无需外部中间件）
- 预置 30 条京郊/华北常见线路（含五台山等跨省五日线）
- 用户端（H5 / 原生小程序）与后台共用同一套 REST API
- 微信登录、图片验证码、短信、支付均可在演示模式下闭环（不依赖真实商户号）
- 生产可部署到腾讯云轻量（Nginx 反代 Express，PM2 常驻）

非目标（后续迭代）：真实短信网关、微信原路退款、轨迹导航、定向发券与券短信、券商城。候补、座位图、保险加购、天气提醒、企业支付分账、导游 H5 工作台、出行评价、紧急联系人与风险确认、铁定出发、装备清单与行前 FAQ、官方/规则页、个人相册、候选团与替代团、虚拟用户、双领队与推荐报名、行程公开限量优惠券已落地。

## 2. 系统架构

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐
│ 微信原生小程序 │     │ Vue3 H5 用户端 │     │ Vue3 Element 后台  │
│ miniprogram/ │     │ web /m       │     │ web /admin         │
└──────┬──────┘     └──────┬───────┘     └─────────┬──────────┘
       │  HTTP JSON        │  Vite 代理 /api        │
       └────────────┬──────┴────────────────────────┘
                    ▼
            Express API  :3780
            server/src/app.js
                    │
        ┌───────────┼────────────┐
        ▼           ▼            ▼
   SQLite DB    静态图片       JWT 鉴权
   app.sqlite   /static/*    user / admin
```

本地开发时 Vite 用户端默认 `:3781`，API `:3780`。生产可将 `web/dist` 交给 Express 同端口托管（`createApp()` 在存在 `web/dist` 时挂静态资源），由 Nginx 将 80 转到 3780。

### 2.1 目录职责

| 路径 | 职责 |
| --- | --- |
| `server/src/app.js` | 应用工厂 `createApp()`，便于单测不监听端口 |
| `server/src/index.js` | 进程入口，监听 `PORT`（默认 3780） |
| `server/src/api.js` | 全部 REST 路由 |
| `server/src/db.js` | SQLite 连接、建表、迁移、`toRoute` |
| `server/src/config.js` | 端口、JWT、积分/会员规则、微信 mock 开关；可用环境变量覆盖数据目录 |
| `server/src/services/` | 身份证、报价、画像、导游匹配、微信 mock、验证码、解散、取消报名、注销、候补座位保险天气分账评价、行前政策 |
| `server/src/seed/` | 30 条线路、封面图、演示账号 |
| `web/src/views/mobile` | 用户端页面 |
| `web/src/views/admin` | 后台页面 |
| `miniprogram/` | 原生小程序，打同一套 API |
| `scripts/deploy.sh` | 同步到腾讯云并 PM2 启动 |
| `scripts/e2e.js` | 全功能走查 |

### 2.2 运行时配置

| 变量 | 含义 | 默认 |
| --- | --- | --- |
| `PORT` | API 端口 | `3780` |
| `JWT_SECRET` | 签发密钥 | 开发默认值，上线必须改 |
| `MMC_DATA_DIR` / `MMC_DB_FILE` / `MMC_PUBLIC_DIR` / `MMC_WEB_DIST_DIR` | 数据、静态与前端 dist 目录（单测用临时目录） | `server/data`、`server/public`、`web/dist` |
| `MMC_SKIP_WEB` | `1` 时不托管前端 dist | 未设置则 dist 存在即托管 |
| `WX_APPID` / `WX_APPSECRET` / `WX_MCH_ID` / `WX_MCH_KEY` | 真实微信 | 演示 `wx_demo_appid` |
| `WX_PAY_MOCK` | `0` 关闭 mock 支付 | 默认开启 mock |
| `WEATHER_LIVE` | `1` 强制 Open-Meteo；`0` 强制模拟 | 生产默认实时，本地默认 mock |
| `WX_PAY_NOTIFY` | 支付回调 URL | `http://localhost:3780/api/pay/wechat/notify` |

短信验证码演示固定为 `888888`（`config.demoSmsCode`），接口仍可用，登录/注册 UI 改用图片验证码。测试环境设置 `MMC_SKIP_WEB=1` 时不托管 `web/dist`，避免单测依赖前端构建产物。

## 3. 领域模型

```
Route 1──n PriceTier（人数阶梯价 + 会员价）
Route 1──n BusType（可选车型，决定座位上限）
Route 1──n Schedule（一次具体出发）
Schedule n──1 User（开团人：个人或公司账号；后台开团 organizer_id=0）
Schedule n──0..1 Guide（成团后匹配）
Schedule 1──n Enrollment（出行人，一人一证）
Enrollment 1──n Payment
User 1──n Favorite / PointsLedger / Review
```

### 3.1 线路 Route

- `code`：R01–R30（种子数据），后台可新增
- `days ∈ {1,2,3,5}`
- `min_group_size`：成团人数；排期可覆盖
- `status`：`on` 上架 / `off` 下架（删除接口实际为下架）
- 图文：封面、相册、亮点、行程、费用含/不含、装备、须知、集合点

### 3.2 排期 Schedule

| 字段 | 说明 |
| --- | --- |
| `organizer_type` | `individual` 个人拼团 / `company` 公司团 |
| `max_seats` | 取自所选车型座位数 |
| `share_token` | 分享短链 |
| `status` | `recruiting` 招募 / `confirmed` 已成团 / `cancelled` 已解散；满员与结束可由人数与日期推导 |
| `cancel_reason` 等 | 解散理由、时间、操作者类型与 id |
| 成本六项 | 大巴、门票、住宿、餐食、导游、其他；利润 = 已收 `pay_amount` 合计 − 成本合计 |

`scheduleStatus(enrolled, min, max, date)` 规则（已解散以库中 `cancelled` 为准）：

1. 出发日早于今天 → `finished`
2. 报名人数 ≥ 座位 → `full`
3. 报名人数 ≥ 成团人数 → `confirmed`
4. 否则 `recruiting`

持久化 `schedules.status` 在成团匹配导游时写成 `confirmed`，解散时写成 `cancelled`。

### 3.3 报名 Enrollment

- 必须填写出行人姓名、手机、**18 位身份证**（校验出生日期与校验码；用于性别/生日/籍贯统计；禁止同团重复有效证件）
- 必须填写紧急联系人（11 位手机，且不能与出行人相同），并确认健康声明与户外风险告知
- 个人拼团：`pay_status=unpaid`，占座，`needPay=false`，报名时不生成预支付单
- 公司团：`pay_status=company_pending`，金额暂记 0，由开团公司或后台结算
- `status=cancelled` 不计入人数；取消或解散后已付款改为 `refunded`
- 有效报名人数（不含虚拟用户）≥ 成团人数时排期接口 `guaranteed=true`（铁定出发）
- 一个团最多两位领队；空位可报名领队。推荐领队首次带队完成后奖励 200 元；推荐报名按人数结报名费 5%
- 虚拟用户由运营在指定行程上设置人数并占座，资料按真人报名生成；之后可改人数。真人占座时虚拟用户腾座。前台不暴露虚拟标记。

### 3.3.1 优惠券

- `coupon_campaigns`：按团发行公开限量券。`kind=percent` 时 `value=80` 表示 8 折（付 80%），须填 `cap_amount` 封顶减免；`kind=amount` 为立减元。公司团、已解散团不可发行。
- `user_coupons`：领取后每人每活动 1 张。`unused` 已领未用；候补 `held`；占座成功 `used`；取消/解散退回 `unused`。库存按领取扣减，不因退券回补。
- 报价：先算团价（阶梯 + `offerType`），再在「会员 95 折」与「券后价」取更低，不连乘。保险不加折。会员赠团免单时不核销。链接只带活动码，不含折扣数字。短链 `/c/:code` 302 到 `/m/coupon/:code`。

### 3.4 用户与会员

- 角色：`user` / `company`（公司账号带 `company_name`）
- 会员：年费 99 元，有效期 365 天，会员价 95 折，开通赠一次 100 元以内团。`POST /member/buy` 立即记成功支付并开通
- 积分：消费 1 元积 1 分；会员入账 ×1.2；抵现规则仍为 **100 分 = 1 元**，最多抵应付的 **20%**，且实付至少 **1 元**。当前报名接口不扣积分
- 注销：`users.deleted_at` 软删除，清空手机/密码/openid/证件，昵称改为「已注销用户」

## 4. 关键业务流程

### 4.1 登录

```
图片验证码 ──► GET /auth/captcha（token + image）
手机号+密码+验证码 ──► /auth/login
注册 ──► 昵称+手机+验证码+密码 ──► /auth/register
微信 ──► wx.login code ──► /auth/wechat（演示用 mock openid）
短信登录 API 仍保留：/auth/sms ──► /auth/login-sms（UI 未接）
注销 ──► DELETE /me ──► 旧 token 401「账号已注销」
```

用户 JWT：`{ uid, role, typ: "user" }`；管理员 JWT：`{ aid, role, typ: "admin" }`。中间件按 `typ` 隔离，避免用户 token 访问后台；并拒绝已注销用户。

未登录访问「我的报名」等页时，H5 使用 `requireLogin`：`replace` 到 `/m/login?redirect=原路径`，避免 history 回退死循环。

### 4.2 开团与拼团

1. 用户选择线路、日期、车型、集合点，发布排期（个人须登录；公司须有公司名）
2. 分享：小程序原生转发；H5 调公开海报接口拿二维码并复制链接；短链 `/api/share/:token`（302 到排期页）
3. 报名写入 `enrollments`，名单对外只展示脱敏姓名（`林**`）
4. 人数达到 `min_group_size` 后 `maybeMatchGuide`：
   - 优先导游 `specialties` 包含线路 `category`（如「长城」）
   - 否则空闲导游，再否则任意在岗导游
   - 无导游仍将排期标为 `confirmed`
5. 发起人填写理由后解散：取消报名、已付标记退款、写 `sms_logs`

### 4.3 支付与退款标记

```
个人报名 ──► unpaid 占座（不调起支付）
        ──► 出行前再付（演示环境尚未在报名后强制 mock）

公司报名 ──► company_pending
开团人   ──► /pay/company-settle（仅 organizer_id）
后台     ──► /admin/schedules/:id/settle

用户取消 ──► POST /orders/:id/cancel（出发日前；当天不可取消）
        ──► 释放座位；paid → refunded

解散拼团 ──► 全部有效报名 cancelled；paid → refunded + 退款支付单
会员开通 ──► POST /member/buy 直接 success + grantMembership
```

`/pay/mock-success` 仍可用于调试把报名改为已付，或 `scene=member` 开通会员；用户端开通会员不再走该步。

真实微信支付：配置商户号，设置 `WX_PAY_MOCK=0`，小程序改用 `wx.requestPayment` 真实签名。当前仓库未实现生产回调验签，上线需补 `/pay/wechat/notify`。

### 4.4 人口画像

`parseIdCard` 校验 18 位、真实出生日期、国标校验码，解析：

- 性别：第 17 位奇男偶女
- 生日与年龄段：儿童 0–12 … 66+
- 籍贯：身份证前 2/4 位对照省/市表

`buildDemographics` 同时兼容 `id_card` 与 `idCard`。证件无效时回退报名表上的 `gender` / `birthday` / `hometown`。

### 4.5 阶梯报价

`pickTier` 按 `minPeople` 升序，取「人数 ≥ 门槛」的最高一档。人数不足最低档时仍使用最低档价格（便于未成团时展示预估价）。

会员价与积分抵现在 `calcPayable` 中计算。个人报名时按当时人数（含本人）报价并写入 `pay_amount`，但暂不扣积分、不发起支付。

## 5. 数据表（SQLite）

`users`（含 `deleted_at`）、`admin_users`（含 `status`）、`sms_codes`、`captchas`、`bus_types`、`routes`、`route_price_tiers`、`route_buses`、`guides`、`schedules`（含解散字段）、`enrollments`、`payments`、`points_ledger`、`favorites`、`reviews`、`settings`、`sms_logs`。

建表语句见 `server/src/db.js` 的 `createSchema`；旧库通过 `migrateSchema` 补列。种子脚本 `server/src/seed/run.js` **会清空并重建演示数据**，不要在生产库上误跑。仅更新封面可用 `server/src/seed/refresh-images.js`。部署脚本仅在目标机尚无 `app.sqlite` 时 seed。

## 6. 前端信息架构

用户端（`/m`）：首页发现（全部景点轮播点进详情、即将出行、15 日出发日历、天数入口、目的地、正在拼团、周末短途、领队导游）→ 线路目录筛选/详情（含评价、装备清单、FAQ）→ 排期详情与报名名单（车辆、分时气温曲线、座位头像、代付、官方微信）→ 导游/用户个人页 → 报名占座（紧急联系人、风险确认）/ 开团 → 我的（即将出行、订单、取消、评价、收藏、开通会员、注销）。导游端（`/g`）：手机号登录后看出行名单、紧急联系人并签到，可锁座、调座、补车牌；保存车辆后只读，点修改再改。点姓名查看游客详情（证件掩码、保险、相册与行程）；手机打开时点电话或紧急联系人号码可直接拨打。

后台（`/admin`）：看板 KPI 与图表 → 线路 CRUD/下架/上传封面 → 排期与成本/利润/解散/车辆座位（锁座调座） → 公司结算与本团画像 → 报名明细与代取消 → 用户会员运营 → 管理员账号（仅管理员角色）。

后台账号 `admin_users.status`：`on` 启用 / `off` 停用。角色 `admin` 可管理其他后台账号，`operator` 不能。至少保留一名启用中的管理员。

小程序页面：`pages/index|routes|chain|schedule|enroll|open|mine|login|member|orders|favorites|stats|guides|guide|user`，线路详情在分包 `pkg-detail`。

## 7. 安全与合规边界

- 图片验证码一次性、5 分钟过期；PNG 缓存在进程内存
- 演示环境短信码回显在 API 响应里，仅供开发
- 身份证在列表接口中 `maskIdCard`（保留前 6 后 4）；数据库仍存明文以便画像，生产应考虑加密与最小权限
- JWT 默认密钥必须在部署时替换；建议 HTTPS
- 后台依赖 `localStorage` 中的 `bj_admin_token`，前端路由守卫拦截未登录访问
- 注销为软删除，手机号可再注册；后台用户列表排除已注销
- 配置文件与证书权限、真实微信支付密钥管理需按上线规范单独评审

## 8. 测试策略（摘要）

业务规则（报价、身份证、成团、解散、取消、验证码、注销）以 Node 内置测试 + SuperTest 覆盖；H5 登录跳转以 Vitest 覆盖。全功能走查见 `npm run test:e2e` / `test:e2e:live`。详见 [TESTING.md](./TESTING.md)。
