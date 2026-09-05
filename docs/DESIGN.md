# 同行者众 · 设计文档

本文描述第一阶段产品（微信小程序 + H5 演示 + 管理后台 + 导游工作台）的完整设计：业务目标、领域模型、技术架构、关键流程、数据与安全边界。实现以仓库当前代码为准。

## 1. 产品定位

**同行者众**面向北京及周边短途户外，口号 **在山野，遇见爱**。两条供给：

- **山野团**（`schedules.channel=trip`，默认）：1 / 2 / 3 / 多日线路，图文详情、按日期拼团、座位图、实名报名。
- **同城局**（`channel=activity`）：掼蛋 / 跑步 / 电影 / 招募，只关心周几、几点、在哪、还缺几人；报名只要姓名和手机。

用户可以浏览图文详情、按日期拼团报名。个人拼团报名先占座、费用待出行前支付；公司团先占座后由开团方统一支付。平台提供会员价、学生价、积分规则、成团后自动匹配导游，以及基于身份证解析的本团人口画像（仅山野团）。发起人与后台可解散拼团；用户可取消报名或注销账号。

第一阶段目标：

- 可演示、可本地独立运行（SQLite，无需外部中间件）
- 预置 30 条京郊/华北常见线路（含五台山等跨省五日线），以及 4 场演示同城局
- 用户端（H5 / 原生小程序）与后台共用同一套 REST API
- 微信登录、图片验证码、短信、支付均可在演示模式下闭环（不依赖真实商户号）
- 生产可部署到腾讯云轻量（Nginx 反代 Express，PM2 常驻）

非目标（后续迭代）：真实短信网关、微信原路退款、轨迹导航、券商城。候补、座位图、保险加购、天气提醒、企业支付分账、导游 H5 工作台、出行评价、紧急联系人与风险确认、铁定出发、装备清单与行前 FAQ、官方/规则页、个人相册、候选团与替代团、虚拟用户、双领队与推荐报名、行程公开限量优惠券、定向发券、学生/团体认证、抽奖与完成活动评选已落地。

## 2. 系统架构

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐     ┌──────────┐
│ 微信原生小程序 │     │ Vue3 H5 用户端 │     │ Vue3 Element 后台  │     │ 导游 H5  │
│ miniprogram/ │     │ web /m       │     │ web /admin         │     │ web /g   │
└──────┬──────┘     └──────┬───────┘     └─────────┬──────────┘     └────┬─────┘
       │  HTTP JSON        │  Vite 代理 /api        │                    │
       └────────────┬──────┴────────────────────────┴────────────────────┘
                    ▼
            Express API  :3780
            server/src/app.js
                    │
        ┌───────────┼────────────┐
        ▼           ▼            ▼
   SQLite DB    静态图片       JWT 鉴权
   app.sqlite   /static/*    user / admin / guide
```

本地开发时 Vite 用户端默认 `:3781`，API `:3780`。生产可将 `web/dist` 交给 Express 同端口托管（`createApp()` 在存在 `web/dist` 时挂静态资源），由 Nginx 将 80 转到 3780。

文件级对照见 [CODEMAP.md](./CODEMAP.md)。

### 2.1 目录职责

| 路径 | 职责 |
| --- | --- |
| `server/src/app.js` | 应用工厂 `createApp()`，便于单测不监听端口；`/c/:code` 券短链；托管 dist |
| `server/src/index.js` | 进程入口，监听 `PORT`（默认 3780） |
| `server/src/api.js` | 全部 REST 路由 |
| `server/src/db.js` | SQLite 连接、建表、迁移、`toRoute` |
| `server/src/config.js` | 端口、JWT、积分/会员/学生折扣、微信 mock；可用环境变量覆盖数据目录 |
| `server/src/services/` | 报名、报价、画像、导游匹配、验证码、解散、候补、座位、保险、天气、分账、评价、行前政策、抽奖 |
| `server/src/seed/` | 30 条线路、4 场同城局、封面图、演示账号 |
| `web/src/views/mobile` | 用户端页面 |
| `web/src/views/admin` | 后台页面 |
| `web/src/views/guide` | 导游工作台 |
| `web/src/styles/app.css` | 色板与顶栏（含夜色紫红渐变） |
| `web/src/utils/pageChrome.js` | 子页覆盖顶栏标题 |
| `miniprogram/` | 原生小程序，打同一套 API |
| `scripts/deploy.sh` | 同步到腾讯云并 PM2 启动（进程名 `beiyexing`，目录 `/var/www/beiyexing`） |
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

JWT 有效期：用户/导游 `jwtExpire=30d`，后台 `adminJwtExpire=7d`。

短信验证码演示固定为 `888888`（`config.demoSmsCode`），接口仍可用，登录/注册 UI 改用图片验证码。测试环境设置 `MMC_SKIP_WEB=1` 时不托管 `web/dist`，避免单测依赖前端构建产物。

会员年费 99、会员折扣 0.95、赠一次 ≤100 元团。学生折扣 0.9（`config.student.discountRate`）。推荐报名分成 5%，推荐领队首次带队奖 200 元。

## 3. 领域模型

```
Route 1──n PriceTier（人数阶梯价 + 会员价）
Route 1──n BusType（可选车型，决定座位上限）
Route 1──n Schedule（一次具体出发）
Schedule n──1 User（开团人：个人或公司账号；后台开团 organizer_id=0）
Schedule n──0..1 Guide（成团后匹配；同城局通常不匹配）
Schedule 1──n Enrollment（出行人）
Enrollment 1──n Payment
User 1──n Favorite / PointsLedger / Review
```

### 3.1 线路 Route

- `code`：R01–R30（种子户外线），A01–A04（种子同城局对应的轻量线路）；后台可新增
- `days ∈ {1,2,3,5}`
- `min_group_size`：成团人数；排期可覆盖
- `status`：`on` 上架 / `off` 下架（删除接口实际为下架）
- 图文：封面、相册、亮点、行程、费用含/不含、装备、须知、集合点
- `GET /routes` 会排除「只被同城局排期引用」的线路，避免掼蛋局出现在山野目录

### 3.2 排期 Schedule

| 字段 | 说明 |
| --- | --- |
| `channel` | `trip` 山野团（默认）/ `activity` 同城局 |
| `organizer_type` | `individual` 个人拼团 / `company` 公司团 |
| `max_seats` | 山野团取自车型座位数；同城局为人数上限 |
| `share_token` | 分享短链 |
| `status` | `recruiting` 招募 / `confirmed` 已成团 / `cancelled` 已解散；满员与结束可由人数与日期推导 |
| `review_status` | 用户发团 `pending` → 后台 `approved` / `rejected` |
| `offer_type` | 如 `full` / `free` / 各类特价 |
| `cancel_reason` 等 | 解散理由、时间、操作者类型与 id |
| 成本六项 | 大巴、门票、住宿、餐食、导游、其他；利润 = 已收 `pay_amount` 合计 − 成本合计 |

`scheduleStatus(enrolled, min, max, date)` 规则（已解散以库中 `cancelled` 为准）：

1. 出发日早于今天 → `finished`
2. 报名人数 ≥ 座位 → `full`
3. 报名人数 ≥ 成团人数 → `confirmed`
4. 否则 `recruiting`

持久化 `schedules.status` 在成团匹配导游时写成 `confirmed`，解散时写成 `cancelled`。

### 3.3 报名 Enrollment

- 必须填写出行人姓名、手机。
- **山野团**另须 **18 位身份证**（校验出生日期与校验码；用于性别/生日/籍贯统计；禁止同团重复有效证件）、紧急联系人（11 位手机，且不能与出行人相同），并确认健康声明与户外风险告知。可选座位、保险、补给。
- **同城局**只校验姓名与 11 位手机，按 `user_id` 去重（「你已报名本局」），不写身份证、紧急联系人与弃权时间。成功文案「已报名，到场即可」（免费时）；满员候补「本局已满」，不再说「本车」。
- 个人拼团：`pay_status=unpaid`（应付 > 0）或 `paid`（0 元），占座，`needPay=false`，报名时不生成预支付单
- 公司团：`pay_status=company_pending`，金额暂记 0，由开团公司或后台结算
- `status`：`joined` / `waitlist` / `cancelled`。候补不占座；有人取消后按报名顺序递补
- 有效报名人数（不含虚拟用户）≥ 成团人数时排期接口 `guaranteed=true`（铁定出发）
- 一个团最多两位领队；空位可报名领队。推荐领队首次带队完成后奖励 200 元；推荐报名按人数结报名费 5%
- 虚拟用户由运营在指定行程上设置人数并占座，资料按真人报名生成；之后可改人数。真人占座时虚拟用户腾座。前台不暴露虚拟标记。

详情页若已有 `myEnrollment`，H5 / 小程序不再露出报名按钮。

### 3.3.1 优惠券

- `coupon_campaigns`：按团发行。`audience=public` 公开限量领取；`member` 仅会员自领；`directed` 后台定向发放。`kind=percent` 时 `value=80` 表示 8 折（付 80%），须填 `cap_amount` 封顶减免；`kind=amount` 为立减元。公司团、已解散团不可发行。
- `user_coupons`：领取后每人每活动 1 张。`unused` 已领未用；候补 `held`；占座成功 `used`；取消/解散退回 `unused`。库存按领取扣减，不因退券回补。
- 报价：先算团价（阶梯 + `offerType`），再在「会员 95 折」与「券后价」取更低，不连乘。学生价单独按 9 折展示，报名时与会员/券规则见 `offer.js` / `calcPayable`。保险不加折。会员赠团免单时不核销。链接只带活动码，不含折扣数字。短链 `/c/:code` 302 到 `/m/coupon/:code`。

### 3.4 用户与会员

- 角色：`user` / `company`（公司账号带 `company_name`）
- 会员：年费 99 元，有效期 365 天，会员价 95 折，开通赠一次 100 元以内团。`POST /member/buy` 立即记成功支付并开通
- 学生：`POST /me/student` 填学校全称 → `student_status=pending` → 后台 `POST /admin/users/:id/verify` `kind=student` 通过后 `is_student=1`。部分团 `studentOnly` 或 `schools` 名单（学校名包含匹配，含简称）
- 团体：`POST /me/group` → 待审 → 后台审核
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

用户 JWT：`{ uid, role, typ: "user" }`；管理员 JWT：`{ aid, role, typ: "admin" }`；导游 JWT：`{ gid, typ: "guide" }`。中间件按 `typ` 隔离，避免用户 token 访问后台；并拒绝已注销用户。

未登录访问「我的报名」等页时，H5 使用 `requireLogin`：`replace` 到 `/m/login?redirect=原路径`，避免 history 回退死循环。

### 4.2 开团与拼团

1. **山野团**：用户选择线路、日期、车型、集合点，或 `POST /trips` 发新线路；个人须登录；公司须有公司名。提交后 `review_status=pending`，后台审核通过才上首页。
2. **同城局**：活动 Tab「发起一局」→ `POST /trips` 且 `channel=activity`，选掼蛋/跑步/电影/招募、地点、时间、人数，不必选大巴。审核通过后出现在活动 Tab。
3. 分享：小程序原生转发；H5 调公开海报接口拿二维码并复制链接；短链 `/api/share/:token`（302 到排期页）
4. 报名写入 `enrollments`，名单对外只展示脱敏姓名（`林**`）。同城局名单不展示年龄段。
5. 山野团人数达到 `min_group_size` 后 `maybeMatchGuide`：
   - 优先导游 `specialties` 包含线路 `category`（如「长城」）
   - 否则空闲导游，再否则任意在岗导游
   - 无导游仍将排期标为 `confirmed`
6. 发起人填写理由后解散：取消报名、已付标记退款、写 `sms_logs`

### 4.3 支付与退款标记

```
个人报名 ──► unpaid 占座（不调起支付）；0 元则直接 paid
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

`buildDemographics` 同时兼容 `id_card` 与 `idCard`。证件无效时回退报名表上的 `gender` / `birthday` / `hometown`。同城局不采集证件，详情页隐藏本团画像入口。

### 4.5 阶梯报价

`pickTier` 按 `minPeople` 升序，取「人数 ≥ 门槛」的最高一档。人数不足最低档时仍使用最低档价格（便于未成团时展示预估价）。

会员价与积分抵现在 `calcPayable` 中计算。个人报名时按当时人数（含本人）报价并写入 `pay_amount`，但暂不扣积分、不发起支付。

## 5. 数据表（SQLite）

建表语句见 `server/src/db.js` 的 `createSchema`；旧库通过 `migrateSchema` 补列。种子脚本 `server/src/seed/run.js` **会清空并重建演示数据**，不要在生产库上误跑。仅更新封面可用 `server/src/seed/refresh-images.js`。部署脚本仅在目标机尚无 `app.sqlite` 时 seed。

核心表：`users`（含 `deleted_at`、学生/团体字段）、`admin_users`（含 `status`）、`sms_codes`、`captchas`、`bus_types`、`routes`、`route_price_tiers`、`route_buses`、`guides`、`schedules`（含 `channel`、解散字段、审核、成本）、`enrollments`、`payments`、`payment_splits`、`points_ledger`、`favorites`、`reviews`、`settings`、`sms_logs`、`play_tags`、`coupon_campaigns`、`user_coupons`、`feedbacks`、`lottery_draws`、`contest_posts`、`contest_votes`、`user_photos`、`schedule_leaders`、`enrollment_fallbacks`、`referrals`、`leader_referrals`。

## 6. 前端信息架构与视觉

用户端（`/m`）：底栏 **首页 / 活动 / 行程 / 我的**。

| Tab | 内容 |
| --- | --- |
| 首页 | 山野发现。状态栏图形标 + 活字「同行者众」+ 口号；全幅景点轮播；学生认证卡；已登录未出行时「即将出行」跳行程；「哪天玩」默认收起；城市/玩法/特价筛选；发团；页脚只留「客服与规则」 |
| 活动 | 同城局：本周场次、四宫格分类、日期块列表。「发起一局」 |
| 行程 | 待出行 / 历史 chips；第一张待出行做成「下一趟」；取消为文字链；免费局不显示 ¥0 |
| 我的 | 夜色资料卡 + 出行 / 权益 / 服务三组 cell。会员、学生、团体、抽奖、客服都在这里，不回首页堆增长入口 |

同城局详情按时间/地点/人数组织，不展示座位图、装备、保险、推荐佣金、本团画像。已报名则隐藏报名按钮，提示到场找发起人。山野团仍走座位图与实名报名。

导游端（`/g`）：手机号 + 图片验证码登录后看出行名单、紧急联系人并签到，可锁座、调座、补车牌；保存车辆后只读，点修改再改。点姓名查看游客详情（证件掩码、保险、相册与行程）；手机打开时点电话或紧急联系人号码可直接拨打。

后台（`/admin`）：看板 KPI 与图表 → 线路 CRUD/下架/上传封面 → 排期与成本/利润/解散/车辆座位（锁座调座）→ 公司结算与本团画像 → 报名明细与代取消 → 用户会员与学生/团体审核 → 玩法标签 → 管理员账号（仅管理员角色）。

后台账号 `admin_users.status`：`on` 启用 / `off` 停用。角色 `admin` 可管理其他后台账号，`operator` 不能。至少保留一名启用中的管理员。权限点见 `server/src/services/staff.js`：`staff` / `ops` / `field` / `roster` / `photo`。

小程序页面：`pages/index|activities|orders|mine|official|feedback|lottery|after|routes|chain|schedule|enroll|coupon|coupons|open|login|member|favorites|stats|guides|guide|user|publish`，线路详情在分包 `pkg-detail`。H5 另有 `/m/student`、`/m/group`，小程序尚未做独立页。

### 6.1 视觉规范

- **名称**：同行者众。口号：在山野，遇见爱。
- **标识**：沿用原来的 `web/public/brand/logo.jpg`（绿丘、紫红徒步人、线描山峰）。顶栏小标是该图左侧图形的裁切 `mark.png`，旁边用活字写「同行者众」，避免 logo 里的字和标题叠两遍。
- **顶栏配色**：夜色底，紫 `#6B2178` → 红 `#821A2A` 水平渐变；上沿 3px 双色细线。首页不重复第二行标题。不改 logo 图形本身。
- **CSS 变量**（`web/src/styles/app.css`）：`--thu`、`--pku`、`--night`，以及原森林绿 `--forest` / `--leaf` / `--cream`。
- **Tab 选中色**：紫。小程序 `navigationBarBackgroundColor` `#3a1848`，`selectedColor` `#6b2178`。
- **首页学生卡**：双色左边条 +「学生认证」CTA。文案只谈学生价与高校限制，不写具体校名。
- 报名/开团表单里「例如：北京大学」一类占位符是资格示例，不是品牌文案。

## 7. 安全与合规边界

- 图片验证码一次性、5 分钟过期；PNG 缓存在进程内存
- 演示环境短信码回显在 API 响应里，仅供开发
- 身份证在列表接口中 `maskIdCard`（保留前 6 后 4）；数据库仍存明文以便画像，生产应考虑加密与最小权限
- JWT 默认密钥必须在部署时替换；建议 HTTPS
- 后台依赖 `localStorage` 中的 `bj_admin_token`，前端路由守卫拦截未登录访问
- 注销为软删除，手机号可再注册；后台用户列表排除已注销
- 配置文件与证书权限、真实微信支付密钥管理需按上线规范单独评审

## 8. 测试策略（摘要）

业务规则（报价、身份证、成团、解散、取消、验证码、注销、同城局轻报名）以 Node 内置测试 + SuperTest 覆盖；H5 登录跳转、行程拆分、同城局分类、轮播地址、天气图以 Vitest 覆盖。全功能走查见 `npm run test:e2e` / `test:e2e:live`。详见 [TESTING.md](./TESTING.md)。
