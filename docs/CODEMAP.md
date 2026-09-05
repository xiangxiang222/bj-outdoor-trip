# 同行者众 · 代码地图

把仓库拆开看：三端共用一套 Express API 和一份 SQLite。改功能先对这张表，再翻对应文件。

## 1. 仓库树

```
bj-outdoor-trip/
  README.md                 启动、演示账号、功能总览
  docs/                     本文档目录
  package.json              根脚本：dev / test / seed / deploy
  scripts/
    deploy.sh               rsync 到腾讯云 + 远程构建 + PM2
    prod-start.sh           生产启动（读 .env，必要时 seed）
    server-setup.sh         首次装 Node / Nginx / PM2
    nginx-beiyexing.conf    80 → 3780
    e2e.js                  全功能走查
  .github/workflows/deploy.yml   推 main 自动部署
  server/
    src/app.js              createApp()：静态资源、/api、SPA、/c/:code
    src/index.js            监听 PORT（默认 3780）
    src/api.js              全部 REST 路由
    src/db.js               SQLite 建表与 migrateSchema
    src/config.js           端口、JWT、会员/学生折扣、微信 mock
    src/middleware/auth.js  user / admin / guide JWT
    src/services/           业务规则（报名、报价、券、座位…）
    src/seed/               30 条线路 + 4 场演示同城局 + 演示账号
    public/static/          封面、相册、品牌标、上传文件
    data/app.sqlite         开发库（单测不用这份）
    test/                   node:test + SuperTest
  web/                      Vue3 + Vite
    src/views/mobile        用户端 H5（/m）
    src/views/admin         Element Plus 后台（/admin）
    src/views/guide         导游工作台（/g）
    src/layouts             MobileLayout / AdminLayout / GuideLayout
    src/components          TripPrices、WeatherChart
    src/styles/app.css      色板与顶栏
    public/brand            logo.jpg（原标识）与 mark.png（顶栏裁切）
    src/utils/*.test.js     Vitest
  miniprogram/              微信原生小程序，打同一套 API
```

不要提交 `server/public/static/buses/`（本地车型图缓存）。不要在生产库跑 `npm run seed`。

## 2. 三端入口

| 端 | 本地 | 线上 | 源码 |
| --- | --- | --- | --- |
| 用户 H5 | http://127.0.0.1:3781/m | http://192.144.167.212/m | `web/src/views/mobile` + `MobileLayout.vue` |
| 管理后台 | http://127.0.0.1:3781/admin | http://192.144.167.212/admin | `web/src/views/admin` |
| 导游端 | http://127.0.0.1:3781/g | http://192.144.167.212/g | `web/src/views/guide` |
| API | http://127.0.0.1:3780/api | http://192.144.167.212/api | `server/src/api.js` |
| 小程序 | 开发者工具打开 `miniprogram/` | 默认请求线上 API | `miniprogram/pages/*` |

Vite 把 `/api`、`/static` 代理到 3780（`web/vite.config.js`）。生产 `npm run build` 后 Express 托管 `web/dist`，Nginx 把 80 转到 3780。

## 3. 服务端 `server/src/services/`

| 文件 | 职责 |
| --- | --- |
| `enroll.js` | 报名。`channel=activity` 只校验姓名+手机，按 `user_id` 去重；山野团要身份证/紧急联系人/弃权 |
| `home.js` | 首页轮播、城市、节日、玩法标签；同城局线路不进景点轮播 |
| `biz.js` | 阶梯价、会员价、积分抵现、排期状态、姓名脱敏 |
| `offer.js` | 特价类型；学生价 = 原价 × `config.student.discountRate`（0.9） |
| `eligibility.js` | 仅学生 / 指定高校 |
| `combo.js` | 组合团另一半条件 |
| `coupons.js` | 公开/会员/定向券，核销与退回 |
| `seats.js` | 2+2 座位图、锁座、改座 |
| `waitlist` 逻辑在 `enroll.js` `promoteWaitlist` | 满员候补、取消后递补 |
| `idcard.js` | 18 位校验、性别/生日/籍贯 |
| `policy.js` | 退改文案、风险告知、FAQ、官方账号 |
| `weather.js` | Open-Meteo 或 mock |
| `leaders.js` / `referral.js` | 双领队、推荐码 5%、领队奖 200 |
| `lottery.js` / `aftertrip.js` / `contest.js` | 抽奖、完成活动、评选 |
| `virtual.js` | 后台虚拟占座，真人报名腾座 |
| `dissolve.js` | 解散拼团 |
| `account.js` | 注销 |
| `wechat.js` / `sms.js` / `captcha.js` | 演示支付、短信 888888、图片验证码 |
| `staff.js` | 后台角色与权限 |
| `profile.js` | 公开主页 |
| `supplies.js` | 随车补给加购 |
| `split.js` | 演示分账 |
| `trip.js` | 发团审核相关辅助 |
| `helpers.js` | 报价、成团匹配导游、积分入账 |
| `fallback.js` | 候选团 / 替代团 |

路由全集中在 `api.js`，不在 services 里挂 HTTP。

## 4. H5 用户端路由（`web/src/router/index.js`）

底栏四个 Tab：`/m` 首页、`/m/activities` 活动、`/m/orders` 行程、`/m/mine` 我的。

| 路径 | 页面 | 说明 |
| --- | --- | --- |
| `/m` | Home | 山野发现：夜色顶栏 lockup、全幅轮播、学生认证卡、折叠日历、正在拼的团 |
| `/m/activities` | Activities | 同城局列表（`GET /schedules?channel=activity`） |
| `/m/orders` | Orders | 下一趟 + 待出行/历史 |
| `/m/mine` | Mine | WeUI 分组：出行 / 权益 / 服务 |
| `/m/official` | Official | 客服与规则；`/m/rules` 重定向到 `#rules` |
| `/m/student` | Student | 填学校全称，待后台审核 |
| `/m/group` | Group | 团体认证 |
| `/m/schedule/:id` | ScheduleDetail | 山野团：座位/保险/画像；同城局：时间地点人数 |
| `/m/enroll/:id` | Enroll | 同城局姓名+手机；山野团实名 |
| `/m/publish` | Publish | `channel=trip\|activity`，提交后待审 |
| `/m/route/:id` | RouteDetail | 30 条线路图文 |
| `/m/routes` | RouteList | 线路目录（底栏不再放入口，可直接打开） |
| `/m/login` | Login | 图片验证码 + 密码；微信演示授权 |
| `/m/member` `/m/coupons` `/m/coupon/:code` | 会员与券 | |
| `/m/lottery` `/m/after/:id` `/m/feedback` | 抽奖、完成活动、建议 | |
| `/m/guides` `/m/guide/:id` `/m/user/:id` | 领队、导游详情、个人主页 | |
| `/m/favorites` `/m/stats/:id` `/m/chain` `/m/open/:id` | 收藏、画像、进行中的团、开团 | |

顶栏文案由 `web/src/utils/pageChrome.js` 覆盖；首页隐藏第二行 `.mp-nav`，只留 lockup。

## 5. 小程序页面（`miniprogram/app.json`）

Tab：**首页 / 活动 / 行程 / 我的**。导航栏底色 `#3a1848`，选中色 `#6b2178`。

主包页面与 H5 基本一一对应。线路详情在分包 `pkg-detail/detail`。

**和 H5 的差：**

- 没有独立「学生认证」「团体认证」页。首页学生认证按钮在已登录时跳到「我的」。
- 「我的」权益组目前有优惠券、会员、抽奖；没有学生/团体/推荐报名/推荐领队入口（这些在 H5 有）。
- 官方页快捷入口没有「学生认证」磁贴。
- `miniprogram/config.js`：`USE_LOCAL_API` 默认 `false`，请求 `http://192.144.167.212`。

## 6. 后台与导游端

后台 `/admin`：看板、线路、拼团与成本、报名、优惠券、用户与会员、玩法标签、管理员。登录页与侧栏用原来的 `logo.jpg`。侧栏副标题「后台 · 线路 · 排期 · 财务」。

导游 `/g`：图片验证码登录 → 行程列表 → 名单签到 / 游客详情 / 锁座调座 / 车牌。演示号 `13700001101`。

路由守卫：`bj_admin_token`、`bj_guide_token` 存在 `localStorage`。

## 7. 品牌资源

| 文件 | 用途 |
| --- | --- |
| `web/public/brand/logo.jpg` | 产品标识（客服页、后台、favicon） |
| `web/public/brand/mark.png` | 顶栏小标：从 logo 裁出徒步人与山丘 |
| `server/public/static/brand/` | API 托管的同一套图 |
| `miniprogram/images/logo.jpg` | 小程序官方页 |

色板在 `web/src/styles/app.css`：`--thu` `#6b2178`、`--pku` `#821a2a`、`--night` `#161218`，以及原有森林绿系。顶栏是紫→红渐变，上沿 3px 双色细线。产品文案只用「同行者众」「在山野，遇见爱」，不要写校名或官方校徽。

## 8. 数据怎么流

```
首页 GET /home + GET /schedules?channel=trip
活动 GET /schedules?channel=activity
详情 GET /schedules/:id（optionalUser → myEnrollment）
报名 POST /enroll → services/enroll.js
行程 GET /orders  （H5 Orders.vue 拆待出行/历史）
我的 GET /me + GET /me/coupons
发团 POST /trips（review_status=pending）→ 后台 POST /admin/schedules/:id/review
```

`schedules.channel`：`trip`（默认）山野团；`activity` 同城局。首页与景点轮播排除 activity 线路。

## 9. 种子数据（`server/src/seed/run.js`）

- 30 条户外线路 R01–R30，若干近期排期与演示报名
- 4 场同城局 A01–A04：掼蛋、夜跑、电影、招募（`channel=activity`，`offer_type=free`）
- 用户 `13800138000`（会员林北野）、公司 `13900139000`、领队 `13700137000`
- 导游林晓峰 `13700001101` 等
- 后台 `admin` / `admin123`

脚本会清空业务表后重建。仅刷新封面用 `server/src/seed/refresh-images.js`。
