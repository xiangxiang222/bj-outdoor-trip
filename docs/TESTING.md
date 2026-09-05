# 同行者众 · 如何跑测试

本文说明测试分层、环境隔离、命令、覆盖率门槛，以及如何为新接口补用例。单元测试**不会**写入开发用的 `server/data/app.sqlite`，也**不会**下载 30 条线路的实景照片。

## 1. 依赖

需要 Node.js 18+（建议 20）。在仓库根目录：

```bash
npm install
npm install --prefix server
npm install --prefix web
```

服务端测试依赖：Node 内置 `node:test` / `node:assert/strict`、`supertest`、覆盖率 `c8`。  
用户端测试依赖：`vitest`（覆盖 `web/src/utils/auth.js` 登录跳转）。

## 2. 一条命令跑全部

在**仓库根目录**：

```bash
npm test
```

等价于先后执行：

```bash
npm run test --prefix server
npm run test --prefix web
```

只看服务端覆盖率：

```bash
npm run test:coverage
```

HTML 报告生成在 `server/coverage/index.html`，用浏览器打开即可。终端会打印行/函数/分支覆盖率。当前门槛（`server/c8rc.json`）：

| 指标 | 最低 |
| --- | --- |
| 行 / 语句 / 函数 | 80% |
| 分支 | 65% |

未达标时 `npm run test:coverage` 以非 0 退出。排除项：进程入口 `src/index.js`、会联网的全量 seed `src/seed/run.js` 与 `refresh-images.js`。

当前约 **171** 条服务端用例 + **14** 条 H5 用例。

## 3. 只跑某一类用例

进入 `server/` 后可以使用 Node 测试运行器的名字过滤：

```bash
cd server
node --test --test-concurrency=1 --require ./test/setup-env.js --test-name-pattern="parseIdCard" test/*.test.js
node --test --test-concurrency=1 --require ./test/setup-env.js test/biz.test.js
node --test --test-concurrency=1 --require ./test/setup-env.js test/api.enroll.test.js
node --test --test-concurrency=1 --require ./test/setup-env.js test/api.dissolve.test.js
node --test --test-concurrency=1 --require ./test/setup-env.js test/captcha.test.js
```

`--require ./test/setup-env.js` **必须保留**：它在加载业务代码前把 `MMC_DATA_DIR` / `MMC_DB_FILE` / `MMC_PUBLIC_DIR` / `MMC_WEB_DIST_DIR` 指到系统临时目录，避免污染本地库，并用一份迷你 `index.html` 覆盖前端托管逻辑。

`--test-concurrency=1` 保证同一进程内串行，减少 SQLite 文件争用。

用户端：

```bash
cd web
npx vitest run src/utils/auth.test.js
```

## 4. 测试在覆盖什么

### 4.1 纯函数 / 领域规则（不启 HTTP）

| 文件 | 覆盖点 |
| --- | --- |
| `idcard.test.js` | 身份证校验（含校验码）、男女、籍贯、掩码、年龄段 |
| `biz.test.js` | 阶梯价、会员价、积分抵现 20% 与至少 1 元、画像聚合、排期状态、姓名脱敏 |
| `wechat.test.js` | mock openid、code2session、预支付参数 |
| `auth.middleware.test.js` | 用户/管理员 JWT、过期、错误 typ、query token、已注销账号、停用管理员 |
| `captcha.test.js` | 图片验证码生成与比对 |
| `routes-data.test.js` | 30 条线唯一编号、天数 ∈ {1,2,3,5}、R29 `coverKey=wutai` |
| `image-helpers.test.js` | SVG 封面、缺图回退、download 失败/过小/异常 |
| `policy.test.js` | 装备拆条、地图 URL、`/meta` 退改与免责 |
| `config.test.js` | 测试环境目录覆盖是否生效 |

### 4.2 带数据库的服务

`helpers.service.test.js`：会员是否过期、报价、取消报名不计入人数、成团匹配导游、无导游仍确认、缺线路、积分流水、静态资源 URL。

`db.test.js`：`toRoute` JSON 映射、`resetDb` 重开连接。

`app.test.js`：存在 dist 时的 SPA 托管。

每条用例 `beforeEach` 调用 `seedMinimal()`：只写入 1 条线路、2 个用户、1 个管理员、个人团/公司团各 1 个排期，**不跑全量 seed**。

### 4.3 HTTP API（SuperTest + `createApp()`）

应用工厂不 `listen`，测试进程不占用 3780。

| 文件 | 覆盖点 |
| --- | --- |
| `api.auth.test.js` | meta、短信、图片验证码注册/登录、微信演示登录、改资料、注销 |
| `api.routes.test.js` | 筛选、收藏标记、名单脱敏、分享 302、开团校验、海报 QR、导游列表与详情（无需登录） |
| `api.enroll.test.js` | 个人占座（`needPay: false`）、紧急联系人/健康/免责、`/me/trips`、公司挂账与结算权限、满员、成团导游、取消报名（出发当天不可取消）、会员购买、收藏 |
| `api.coupon.test.js` | 公开限量领取、每人一张、会员与券取低不叠、赠团不核销、候补占用/递补核销/取消退券、公司团与暂停领取、仅会员领取、定向发放与演示短信 |
| `coupons.service.test.js` | 折扣封顶、立减与保底价 |
| `api.reviews.test.js` | 仅报名成功可评、每团一条、线路/排期列表、候补与取消不可评 |
| `api.dissolve.test.js` | 发起人解散、非发起人 403、后台解散单团与全部、重复解散 |
| `api.admin.test.js` | 看板、线路增改下架、封面上传、排期成本利润、后台结算、报名脱敏、用户列表 |
| `api.guide.test.js` | 导游登录、行程名单含紧急联系人、游客详情、签到 |
| `api.staff.test.js` | 后台账号增删改/停用、改密、运营权限、用户会员积分注销、后台代取消报名 |

### 4.4 前端

`web/src/utils/auth.test.js`：已登录放行；未登录 `replace` 到 `/m/login` 并带 `redirect`。  
`web/src/utils/trips.test.js`：行程列表拆成待出行 / 历史，同城局与山野团标签。  
`web/src/utils/media.test.js`：首页轮播把绝对地址收成 `/static/...`，缺图回退 SVG。

Vue 页面与小程序以手动/演示验收为主（依赖浏览器与微信开发者工具）；完整接口顺序见第 8 节走查。

## 5. 编写新测试

1. 服务端文件放在 `server/test/`，文件名 `*.test.js`（Node 默认发现规则）。
2. 需要数据库或 HTTP 时：

```js
const { harness, loginUser, auth, ID } = require("./http");
beforeEach(() => {
  ({ agent, seed } = harness());
});
```

`harness()` 会重建最小种子并 `createApp()`。演示身份证见 `http.js` 的 `ID`（须通过校验码）。

3. **不要** `require("../src/index.js")`，否则会绑定端口。
4. **不要**在用例里调用 `src/seed/run.js`（会清空真实数据目录，除非你覆盖了 env）。
5. 断言业务语义（支付状态、成团、掩码、解散、注销），不要只断言 `ok: true`。
6. 魔法数字与产品规则保持一致：短信 `888888`、年费 99、100 积分=1 元、抵现上限 20%。注册/密码登录需先取图片验证码。

## 6. 与开发数据库的关系

| 操作 | 是否动 `server/data/app.sqlite` |
| --- | --- |
| `npm test` / `npm run test:coverage` | 否（临时目录） |
| `npm run test:e2e` | 否（临时目录） |
| `npm run test:e2e:live` | 打已启动服务；线上模式用临时手机号，结束时注销 |
| `npm run seed` | **是，清空并重建** |
| `node server/src/seed/refresh-images.js` | 只更新封面字段与图片文件 |
| `npm run dev` | 读写开发库 |

单测失败时先看断言消息；若提示表不存在，确认是否漏了 `--require ./test/setup-env.js`。

## 7. CI 建议

```bash
npm install --prefix server && npm install --prefix web
npm test
npm run test:coverage --prefix server
```

无需 Ascend/NPU 或真实微信。覆盖率门槛以 `server/c8rc.json` 为准。上线前再跑第 8 节走查。

## 8. 全功能走查（推荐上线前再跑）

单元测试按模块切开；走查脚本按真实使用顺序把公开接口、用户端、后台和 H5 页面打一遍（含验证码登录、占座报名、取消、解散、开通会员、注销）。

隔离临时库（不写 `server/data/app.sqlite`，也不动线上）：

```bash
npm run test:e2e
```

打已启动的服务（本机 `npm run dev` 或线上）：

```bash
npm run test:e2e:live
node scripts/e2e.js --live --base http://192.144.167.212
```

线上模式只用临时手机号，结束时注销测试账号，**不会**执行「解散全部拼团」。若确实要在目标环境解散全部，显式加 `--unsafe`。
