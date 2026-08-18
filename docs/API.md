# 北野行 · HTTP API

Base URL 本地为 `http://127.0.0.1:3780/api`，线上为 `http://192.144.167.212/api`。JSON 请求与响应。成功时 `ok: true`，失败时 HTTP 4xx 且 `ok: false`，`message` 为中文原因。

## 鉴权

| 类型 | Header | 签发 |
| --- | --- | --- |
| 用户 | `Authorization: Bearer <token>` | `/auth/login`、`/auth/login-sms`、`/auth/register`、`/auth/wechat` |
| 管理员 | 同上 | `/admin/login` |

部分接口也接受 `?token=`。用户 token 不能访问 `/admin/*`（除登录）。已注销账号的 token 返回 401「账号已注销」。

`optionalUser`：有合法用户 token 则解析 `userId`，否则当游客。

## 公开

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/meta` | 品牌名、演示短信码、会员年费、积分规则、可选天数 |
| GET | `/buses` | 车型 |
| GET | `/guides` | 导游公开信息 |
| GET | `/routes` | 上架线路。Query：`days` `category` `difficulty` `q` |
| GET | `/routes/:id` | 详情、阶梯价、车型、排期、是否已收藏 |
| GET | `/schedules` | Query：`routeId` `organizerType`（不含已解散） |
| GET | `/schedules/:id` | 排期 + 脱敏名单；已解散团仍可查看 |
| GET | `/schedules/:id/demographics` | 本团画像 |
| GET | `/schedules/:id/poster` | 分享 URL + QR DataURL（**无需登录**） |
| GET | `/share/:token` | 302 到 `/m/schedule/:id?token=` |

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
| GET | `/me` | 用户 | 当前用户（证件掩码） |
| PUT | `/me` | 用户 | `nickname` `gender` `birthday` `idCard` `companyName` `avatar` |
| DELETE | `/me` | 用户 | 注销：清空手机/密码/openid/证件，取消未完成报名；同一手机可再注册 |

注册、密码登录会消耗图片验证码；错误或过期返回「验证码错误或已过期」。查询用户时忽略 `deleted_at` 非空记录。

## 开团、报名、支付

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/schedules` | 用户 | 开团。公司类型必须有公司名 |
| POST | `/schedules/:id/dissolve` | 用户 | 仅发起人。body：`reason`（必填，≤200 字） |
| POST | `/enroll` | 用户 | 报名占座。个人 `pay_status=unpaid`、`needPay: false`；公司 `company_pending` |
| POST | `/pay/mock-success` | 用户 | 演示支付成功。`scene=member` 开通会员；否则按 `tradeNo`/`enrollmentId`。报名流程默认不调用 |
| POST | `/pay/company-settle` | 用户 | 仅该团 `organizer_id` 可调 |
| GET | `/orders` | 用户 | 我的报名；每条带 `canCancel` |
| POST | `/orders/:id/cancel` | 用户 | 取消自己的报名（出发日前、团未解散） |
| POST | `/member/buy` | 用户 | **立即开通/续费会员**，记一笔成功支付并返回 `user` |
| GET | `/points` | 用户 | 积分余额与流水 |
| POST | `/favorites/:routeId` | 用户 | 收藏 |
| DELETE | `/favorites/:routeId` | 用户 | 取消收藏 |
| GET | `/favorites` | 用户 | 收藏列表 |
| POST | `/reviews` | 用户 | `scheduleId` `rating` `content` |

### 报名 body

```json
{
  "scheduleId": 1,
  "travelerName": "林北野",
  "travelerPhone": "13800138000",
  "idCard": "110101199205121219",
  "travelerType": "adult"
}
```

身份证须 18 位且校验码正确。同团同一证件不可重复（已取消的不计）。满员、已解散返回 400。当前实现报名时 `points_used=0`，不读取抵现开关。

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

取消报名：活动开始日（含当天之前）可取消；已开始返回「活动已开始，无法取消报名」。已付款则退款标记。同一证件取消后可再报。

## 管理端（均需管理员 token，登录除外）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/admin/login` | `username` `password`。成功返回 token 与账号资料。停用账号不可登录 |
| GET | `/admin/me` | 当前后台账号（无密码） |
| PUT | `/admin/me/password` | `oldPassword` `newPassword` |
| GET | `/admin/staff` | 后台账号列表。仅 `role=admin` |
| POST | `/admin/staff` | 新增。`username` `name` `password` `role`=`admin`/`operator` |
| PUT | `/admin/staff/:id` | 改姓名/角色/状态/`password`。不能停用自己，至少留一名管理员 |
| DELETE | `/admin/staff/:id` | 删除。不能删自己，至少留一名管理员 |
| GET | `/admin/dashboard` | KPI、按线路、按天数 |
| POST | `/admin/upload` | `multipart/form-data` 字段 `file`，返回 `{ url }` |
| GET | `/admin/routes` | 含下架 |
| POST | `/admin/routes` | 创建。可选 `priceTiers` `buses` |
| PUT | `/admin/routes/:id` | 更新；提交 `priceTiers`/`buses` 会整表替换 |
| DELETE | `/admin/routes/:id` | 下架 |
| POST | `/admin/schedules` | 后台发布排期 |
| GET | `/admin/schedules` | 含成本、收入、利润、导游 |
| POST | `/admin/schedules/dissolve-all` | 解散全部进行中的团。body：`reason` |
| POST | `/admin/schedules/:id/dissolve` | 解散单团。body：`reason` |
| PUT | `/admin/schedules/:id/cost` | `transport` `ticket` `hotel` `meal` `guide` `other` |
| POST | `/admin/schedules/:id/settle` | 公司团挂账结算 |
| GET | `/admin/enrollments` | Query：`scheduleId` `q` `payStatus` `status` |
| POST | `/admin/enrollments/:id/cancel` | 后台取消报名（已付款标记退款） |
| GET | `/admin/users` | Query：`q`。不含已注销、不含证件；带 `isMember` |
| POST | `/admin/users/:id/member` | `action=grant` 开通/续费，`revoke` 取消会员 |
| POST | `/admin/users/:id/points` | `delta` 非零整数、`reason` |
| POST | `/admin/users/:id/close` | 注销该用户 |
| GET | `/admin/schedules/:id/demographics` | 本团画像 |

## 静态资源

- `GET /static/...` 对应 `server/public/static`
- 线路封面可能是 `/static/photos/*.jpg`、`/static/routes/Rxx.svg` 或后台上传的 `/static/uploads/*`
