# 同行者众 · HTTP API

Base URL 本地为 `http://127.0.0.1:3780/api`，线上为 `http://192.144.167.212/api`。JSON 请求与响应。成功时 `ok: true`，失败时 HTTP 4xx 且 `ok: false`，`message` 为中文原因。

## 鉴权

| 类型 | Header | 签发 |
| --- | --- | --- |
| 用户 | `Authorization: Bearer <token>` | `/auth/login`、`/auth/login-sms`、`/auth/register`、`/auth/wechat` |
| 管理员 | 同上 | `/admin/login` |
| 导游 | 同上 | `/guide/login` |

部分接口也接受 `?token=`。用户 token 不能访问 `/admin/*`（除登录）。已注销账号的 token 返回 401「账号已注销」。用户/导游 JWT 默认 30 天，后台 7 天。

`optionalUser`：有合法用户 token 则解析 `userId`，否则当游客。

## 公开

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/meta` | 品牌名、口号 `slogan`（在山野，遇见爱）、演示短信码、会员年费/95折/赠团文案、`studentDiscountRate`（0.9）、积分规则、保险方案、补给、可选天数、退改说明、风险告知、常见问题、官方账号、公共规则、推荐领队文案 |
| GET | `/home` | 首页：全部上架景点轮播（`brand.slides`，含 `routeId`/`title`/`url`）、按城市分组的景点轮播、玩法标签、节日、月份、天数缩略图。同城局线路不进轮播。Query：`month=YYYY-MM` 返回该月日历（不含 activity） |
| GET | `/play-tags` | 想怎么玩标签（名称、颜色、配图） |
| GET | `/users/:id` | 用户公开主页：昵称、头像、相册、拟出行/已参与/关注的线路。不含手机号 |
| GET | `/weather` | 目的地天气（含 `hourly` 分时气温/降水）。Query：`region` `date`。生产默认走 Open-Meteo 实时预报；本地开发默认 mock。`WEATHER_LIVE=1` 强制实时，`WEATHER_LIVE=0` 强制模拟 |
| GET | `/buses` | 车型 |
| GET | `/guides` | 在岗导游公开资料（不含手机号） |
| GET | `/guides/recruit` | 推荐领队文案与奖励（200 元），登录后带推荐码 |
| GET | `/guides/:id` | 导游详情、带团次数、近期行程。停用或不存在返回 404 |
| GET | `/routes` | 上架线路。排除只被同城局引用的线路。Query：`days`（`multi` 表示 4 日及以上）`category` `tag` `city` `difficulty` `q` |
| GET | `/schedules` | Query：`routeId` `organizerType` `city` `tag` `offerType` `month` `date` `channel=activity\|trip`（不含已解散、待审核）。不含 `virtualEnrolled`。首页传 `channel=trip`，活动 Tab 传 `channel=activity` |
| GET | `/routes/:id` | 详情、阶梯价、车型、排期、是否已收藏；含 `packingList`（由装备字段拆条） |
| GET | `/routes/:id/reviews` | 该线路评价列表。`{ list, count, avg }`，姓名脱敏 |
| GET | `/schedules/:id` | 排期 + 脱敏名单 + 领队1/2、`myEnrollment`、`channel`、本团群二维码、候选团选项、`eligibility`（仅学生/高校限制）。同城局名单不含年龄段展示字段的使用由前端控制 |
| GET | `/schedules/:id/seats` | 座位图。占用位带公开头像/性别/年龄段；锁定座位 `locked` |
| POST | `/schedules/:id/seats/pick` | 已报名用户改座 |
| POST | `/schedules/:id/leaders/apply` | 报名领队（最多两位） |
| POST | `/enrollments/:id/fallbacks` | 设置候选团与替代团 |
| GET | `/schedules/:id/demographics` | 本团画像 |
| GET | `/schedules/:id/reviews` | 该团评价列表。`{ list, count, avg }` |
| GET | `/schedules/:id/poster` | 分享 URL + QR DataURL（**无需登录**） |
| GET | `/share/:token` | 302 到 `/m/schedule/:id?token=` |
| GET | `/coupons/:code` | 公开券详情、剩余、报价预览。登录后带 `claimedByMe`。可选用户 token |
| POST | `/coupons/:code/claim` | 用户。领取（已领则幂等返回）。每人每活动 1 张，库存按领取扣 |

## 登录与资料

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/auth/captcha` | 否 | 图片验证码。返回 `{ token, image }`（data URL），5 分钟有效、一次性 |
| GET | `/auth/captcha-image/:token` | 否 | 同一验证码的 PNG 二进制（进程内存，重启失效） |
| POST | `/auth/sms` | 否 | body：`phone` `scene`。演示返回 `demoCode`。登录/注册 UI 未使用 |
| POST | `/auth/register` | 否 | `phone` `password`(≥6) `nickname` `captchaToken` `captcha` |
| POST | `/auth/login` | 否 | `phone` `password` `captchaToken` `captcha` |
| POST | `/auth/login-sms` | 否 | `phone` `code`；无用户则创建。当前 UI 未使用 |
| POST | `/auth/wechat` | 否 | `code` `nickname` `avatar` |
| GET | `/me` | 用户 | 当前用户（证件掩码；含学生/团体状态） |
| GET | `/me/trips` | 用户 | 即将出行：已报名且团未解散、出发日 ≥ 昨天的 `joined`/`waitlist` |
| GET | `/me/coupons` | 用户 | 我领取的券（含未用/已用/候补占用） |
| GET | `/me/referral` | 用户 | 推荐码、专属二维码、5% 按人结算明细。Query：`scheduleId` |
| POST | `/me/photos` | 用户 | `{ url }` 写入个人相册 |
| DELETE | `/me/photos/:id` | 用户 | 删除自己的相册照片 |
| PUT | `/me` | 用户 | `nickname` `gender` `birthday` `idCard` `companyName` `avatar` |
| POST | `/me/student` | 用户 | `{ school }` 学校全称。写入 pending，待后台审核 |
| POST | `/me/group` | 用户 | `{ name, kind }` 团体认证，pending |
| POST | `/feedback` | 用户 | `{ kind: suggest\|bug, content }`，内容至少 4 字 |
| GET | `/lottery` | 用户 | 抽奖状态。Query：`scheduleId` |
| POST | `/lottery/draw` | 用户 | `{ phase: pre\|post, scheduleId }` |
| GET | `/schedules/:id/after` | 可选用户 | 完成活动页状态 |
| POST | `/schedules/:id/complete` | 用户 | 标记完成活动 |
| GET | `/schedules/:id/contest` | 可选用户 | 评选帖列表 |
| POST | `/schedules/:id/contest` | 用户 | 提交评选 |
| POST | `/contest/:id/vote` | 用户 | 投票 |
| DELETE | `/me` | 用户 | 注销：清空手机/密码/openid/证件，取消未完成报名；同一手机可再注册 |

注册、密码登录会消耗图片验证码；错误或过期返回「验证码错误或已过期」。查询用户时忽略 `deleted_at` 非空记录。

## 开团、报名、支付

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/schedules` | 用户 | 基于已有线路开团。可带 `offerType` `playTagIds` `studentOnly` `schools` |
| POST | `/trips` | 用户 | 发团（类似后台编辑线路）。可带 `channel=activity\|trip`、`activityKind`（掼蛋/跑步/电影/招募）、`studentOnly` `schools` `comboRule`。提交后 `review_status=pending`，审核通过才上首页或活动 Tab |
| POST | `/upload` | 用户 | 发团封面。字段 `file` |
| POST | `/schedules/:id/dissolve` | 用户 | 仅发起人。body：`reason`（必填，≤200 字） |
| POST | `/enroll` | 用户 | 见下方报名 body |
| POST | `/pay/mock-success` | 用户 | 演示支付成功。`scene=member` 开通会员；否则按 `tradeNo`/`enrollmentId`。报名流程默认不调用 |
| POST | `/pay/for-enrollment` | 用户 | 行程页待支付代付。任何人可替 `unpaid` 且已占座的报名支付（演示立即成功）。公司挂账不可用 |
| POST | `/pay/company-settle` | 用户 | 仅该团 `organizer_id` 可调；成功后模拟分账 |
| GET | `/orders` | 用户 | 我的报名；每条带 `canCancel` `canReview` `reviewed`、`channel` |
| POST | `/orders/:id/cancel` | 用户 | 取消自己的报名（出发日前、团未解散；当天不可取消） |
| POST | `/member/buy` | 用户 | **立即开通/续费会员**（年费 99），赠一次 100 元以内团，记成功支付并返回 `user` |
| GET | `/points` | 用户 | 积分余额与流水 |
| POST | `/favorites/:routeId` | 用户 | 收藏 |
| DELETE | `/favorites/:routeId` | 用户 | 取消收藏 |
| GET | `/favorites` | 用户 | 收藏列表 |
| POST | `/reviews` | 用户 | 须已报名成功（非候补）。每人每团一条。`scheduleId` `rating`(1–5) `content`(≤500) |

## 导游端

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/guide/login` | `phone` `captchaToken` `captcha`。演示：`13700001101` |
| GET | `/guide/me` | 当前导游 |
| GET | `/guide/schedules` | 已分配行程 |
| GET | `/guide/schedules/:id` | 名单含手机、座位、紧急联系人、籍贯、年龄段、关联用户 |
| GET | `/guide/schedules/:id/travelers/:enrollmentId` | 本团游客详情：报名资料 + 公开主页（相册/行程）。身份证掩码。仅已分配导游 |
| POST | `/guide/schedules/:id/checkin` | body：`enrollmentId` |
| PUT | `/guide/schedules/:id/trip` | 车牌、本团咨询群 |
| POST | `/guide/schedules/:id/seats/lock` | `seatNo`+`locked` 或 `lockedSeats` 数组 |
| POST | `/guide/schedules/:id/seats/assign` | `enrollmentId` `seatNo`，空位调座或两人互换 |

H5 入口 `/g`。出行名单点姓名进入游客详情；游客手机与紧急联系人号码为 `tel:` 链接，手机可直接拨打。车辆与咨询群保存后只读，点「修改」再改。

### 报名 body

```json
{
  "scheduleId": 1,
  "travelerName": "林北野",
  "travelerPhone": "13800138000",
  "idCard": "110101199205121219",
  "travelerType": "adult",
  "seatNo": "1A",
  "insuranceCode": "outdoor",
  "emergencyName": "紧急联系人",
  "emergencyPhone": "13700000002",
  "waiverAccepted": true,
  "healthOk": true
}
```

**山野团**：身份证须 18 位且校验码正确。紧急联系人手机须 11 位且不能与出行人相同。`waiverAccepted`、`healthOk` 须为真。同团同一证件不可重复（已取消的不计）。

**同城局**（`schedules.channel=activity`）：不校验身份证、紧急联系人与弃权书；同一用户对同一局未取消的报名不可重复（400「你已报名本局」）。候补文案为「本局已满」。免费成功文案「已报名，到场即可」。

已解散返回 400。满员时报名成功但 `waitlisted: true`、`status=waitlist`，不占座位；有人取消后按报名顺序自动递补。当前实现报名时 `points_used=0`，不读取抵现开关。可选 `referrerCode` `couponCode` `autoAlt` `fallbackScheduleIds`。`couponCode` 为活动码或已领实例码；未领则先领取。会员价与券取更低；候补 `held`，占座成功才 `used`。

排期详情含 `waitlistCount`、`remain`、`guaranteed`、`meetupMapUrl`、`channel`；名单项含 `waitlisted`、`seatNo`。报名可传 `seatNo`（如 `1A`），不传则自动分配空位。取消报名成功时若递补了候补，返回 `promoted.enrollmentId`。前端有 `myEnrollment` 时不再展示报名按钮。

报名成功示例：

```json
{
  "ok": true,
  "data": {
    "enrollmentId": 12,
    "payStatus": "unpaid",
    "needPay": false,
    "message": "已报名占座，费用待出行前支付",
    "quote": {}
  }
}
```

### 解散 / 取消

解散成功返回 `cancelled`（取消人数）、`refunded`（退款人数）、`smsCount`。已付款报名改为 `pay_status=refunded`。

取消报名：出发日之前、团未解散时可取消；出发当天及之后返回「出发当天及之后不可取消报名」。已付款则退款标记。同一证件取消后可再报。

## 管理端（均需管理员 token，登录除外）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/admin/login` | `username` `password`。成功返回 token 与账号资料。停用账号不可登录 |
| GET | `/admin/me` | 当前后台账号（无密码） |
| PUT | `/admin/me/password` | `oldPassword` `newPassword` |
| GET | `/admin/staff` | 后台账号列表。仅 `role=admin` |
| POST | `/admin/staff` | 新增。`username` `name` `password` `role`=`admin`/`operator`/`leader`/`photographer` |
| PUT | `/admin/staff/:id` | 改姓名/角色/状态/`password`。不能停用自己，至少留一名管理员 |
| DELETE | `/admin/staff/:id` | 删除。不能删自己，至少留一名管理员 |
| GET | `/admin/dashboard` | KPI、按线路、按天数 |
| POST | `/admin/upload` | `multipart/form-data` 字段 `file`，返回 `{ url }` |
| GET | `/admin/play-tags` | 全部玩法标签 |
| POST | `/admin/play-tags` | 新增。`name` `color` `cover` |
| PUT | `/admin/play-tags/:id` | 更新 |
| DELETE | `/admin/play-tags/:id` | 下架 |
| GET | `/admin/routes` | 含下架 |
| POST | `/admin/routes` | 创建。可选 `priceTiers` `buses` |
| PUT | `/admin/routes/:id` | 更新；提交 `priceTiers`/`buses` 会整表替换 |
| DELETE | `/admin/routes/:id` | 下架 |
| POST | `/admin/schedules` | 后台发布排期。可选 `virtualCount` 发布后立即设置虚拟报名 |
| POST | `/admin/schedules/:id/review` | 用户发团审核。`status=approved|rejected` |
| GET | `/admin/schedules` | 含成本、收入、利润、导游 |
| POST | `/admin/schedules/dissolve-all` | 解散全部进行中的团。body：`reason` |
| POST | `/admin/schedules/:id/dissolve` | 解散单团。body：`reason` |
| PUT | `/admin/schedules/:id/limit` | 报名限制。`studentOnly`、`schools`（数组或逗号分隔）。填高校则自动仅学生 |
| PUT | `/admin/schedules/:id/cost` | `transport` `ticket` `hotel` `meal` `guide` `other` |
| PUT | `/admin/schedules/:id/trip` | `plateNo` `busPhoto` `consultGroup` |
| POST | `/admin/schedules/:id/seats/lock` | 锁定空座位 |
| POST | `/admin/schedules/:id/seats/assign` | 为报名调换座位 |
| POST | `/admin/schedules/:id/settle` | 公司团挂账结算，并模拟分账 |
| GET | `/admin/schedules/:id/splits` | 分账明细 |
| POST | `/admin/schedules/:id/split` | 对已支付金额发起分账（已有记录则复用） |
| GET | `/admin/coupons` | Query：`scheduleId`。公开券列表 |
| POST | `/admin/coupons` | 发行。`scheduleId` `kind=percent|amount` `audience=public|member|directed`；折扣填 `fold`（8=8折）且必填 `capAmount`；立减填 `value`；`total` |
| GET | `/admin/coupons/:id` | 台账 `holders` + 短链/落地页/二维码 `share` |
| PUT | `/admin/coupons/:id` | `status=on|paused|off`，可改名称与发行量（不得小于已领） |
| POST | `/admin/coupons/:id/grant` | 定向发放。`phones`/`phonesText`/`userIds`/`allMembers`，可选 `sms`（默认 true）。一人一码，写入 `sms_logs` 场景 `coupon`，每手机每天最多 1 条 |
| GET | `/admin/enrollments` | Query：`scheduleId` `q` `payStatus` `status` |
| POST | `/admin/enrollments/:id/cancel` | 后台取消报名（已付款标记退款） |
| GET | `/admin/users` | Query：`q`。不含已注销、不含证件；带 `isMember` `isVirtual` `isStudent` `studentStatus` `groupStatus` |
| POST | `/admin/virtual-users` | `{ scheduleId, count }` 将该团虚拟报名人数设为 `count`（可增可减） |
| POST | `/admin/schedules/:id/virtual-users` | `{ count }` 同上，按路径指定行程 |
| POST | `/admin/users/:id/verify` | `{ kind: student\|group, action: approve\|reject }` |
| POST | `/admin/users/:id/member` | `action=grant` 开通/续费，`revoke` 取消会员 |
| POST | `/admin/users/:id/points` | `delta` 非零整数、`reason` |
| POST | `/admin/users/:id/close` | 注销该用户 |
| GET | `/admin/schedules/:id/demographics` | 本团画像 |

后台角色权限（`staff.js`）：超级管理员全部；运营无 `staff`（不能管账号）；领队 `field`+`roster`+`photo`；摄影 `roster`+`photo`。

## 静态资源

- `GET /static/...` 对应 `server/public/static`（含 `/static/brand/mark.svg`）
- `GET /c/:code` 优惠券短链，302 到 `/m/coupon/:code`（不走 `/api`）
- H5 favicon：`/brand/mark.svg`（Vite `web/public`）
- 线路封面可能是 `/static/photos/*.jpg`、`/static/routes/Rxx.svg` 或后台上传的 `/static/uploads/*`
