# 同行者众 · 全模块测试用例

对照日期 2026-09-13。本文把 **注册、高校 / 公司 / 个人、领队、摄影师、发团、抽签、优惠券、抽奖、管理员、用户端、导游端** 的用例放到同一条测试顺序里，并按顺序截图。

配套文件：

| 文件 | 作用 |
| --- | --- |
| [full-tests/AUTOMATED.md](./full-tests/AUTOMATED.md) | 仓库内全部 **325** 条 `it(` 名称（272 服务端 + 53 H5），`npm test` 一次跑完 |
| [full-tests/screenshots/](./full-tests/screenshots/) | 本文手动走查按测试顺序截的图 |
| [TESTING.md](./TESTING.md) | 怎么跑单测、覆盖率、e2e |
| 发团专项（官方线路 + 用户发团） | 见 PR [#57](https://github.com/xiangxiang222/bj-outdoor-trip/pull/57) 的 `docs/PUBLISH_TEST_CASES.md`（合入 `main` 后以仓库文件为准） |

## 怎么读：遍历 ≠ 笛卡尔积截图

产品规则是正交维度上的**交互约束**，不是「每个角色 × 每种团 × 每张券 × 每种抽奖」各拍一张。穷尽组合会到上千格，其中大量格子在代码里直接 400，没有界面。

本仓库的遍历方式：

1. **自动化 325 条**：每条接口/领域规则各断言一次，这是全量遍历。
2. **交互规则表（§2）**：每一条「允许 / 禁止」的组合至少对应一条自动化用例，关键组合另有 UI 截图。
3. **手动走查（§3）**：按真实使用顺序走三端，每一步一张图。每个模块、每种用户身份、每种团型至少出现一次。

跑完全部自动化：

```bash
npm test
```

---

## 0. 环境与账号

本地：API `3780`，H5 `3781`。用户端 `/m`，导游 `/g`，后台 `/admin`。演示短信码 `888888`（当前 H5 登录页不用短信，走图片验证码；短信登录仍由 API / e2e 覆盖）。

| 身份 | 手机 / 账号 | 密码 | 说明 |
| --- | --- | --- | --- |
| 个人会员 | 13800138000 | 123456 | 林北野 |
| 个人非会员 | 13800138001 | 123456 | 陈小川 |
| 公司开团 | 13900139000 | 123456 | 华创团建，`role=company` |
| 个人领队 | 13700137000 | 123456 | 领队老周，`role=leader` |
| 本走查新注册 | 13500001111 | （本次注册） | 测试注册生 → 师生 / 团体 / 领队认证 |
| 导游 | 13700001101 | 图片验证码 | 林晓峰，`/g` |
| 超级管理员 | admin | admin123 | `/admin` |

有效演示身份证（须过校验码，见 `server/test/http.js`）：

- `110101199205121219` 林北野
- `110101199001011229`
- `130102198805201218`
- `370102199512181224` 本走查高校报名用

**不要**在生产库执行 `npm run seed`。

注册入口只有一种公开表单（昵称 + 手机 + 图片验证码 + 密码）。高校 / 团体 / 领队是注册之后的认证；公司账号由种子或后台标记 `role=company`；摄影师是报名身份 `joinMode=photographer`，不是注册类型。

---

## 1. 维度与取值

| 维度 | 取值 |
| --- | --- |
| 注册 / 登录 | 密码+图片验证码；短信登录自动建号；微信演示登录；缺验证码；两次密码不一致 |
| 账号角色 | 普通用户、会员、公司、领队、微信游客（未绑手机）、后台员工、导游 |
| 校园认证 | 未认证 / 师生待审 / 师生通过 / 校友待审 / 校友通过 |
| 团体认证 | 未认证 / 待审 / 通过（学生组织、跑团、品牌、其他） |
| 领队认证 | 未申请 / 待审 / 通过 / 拒绝后再申请 |
| 开团类型 | 个人 `individual`、公司 `company`、高校 `campus`、同城局 `channel=activity` |
| 报名身份 | 普通、摄影师、辅助领队 |
| 资格限制 | 开放、仅学生、学校名单、学院名单、允许校友、组合团 |
| 抽签 | 关；报超会抽（未超全员确认，超员抽签，取消按序递补） |
| 优惠券 | 无、公开领取、仅会员、定向发放、高校名单、通用券、免费券、暂停领取 |
| 抽奖 | 关（回落平台转盘）、报名前、报名后、前后都抽、指定中奖、库存回落 |
| 客户端 | H5 用户端、微信小程序（同 API）、管理后台、导游工作台 |

---

## 2. 组合规则（必须测的交互，不是全网格）

下表每一行都是产品约束。UI 列指向 §3 截图；自动化列指向 `server/test/`。

| # | 组合 | 期望 | UI | 自动化 |
| --- | --- | --- | --- | --- |
| C01 | 密码登录 × 空验证码 | 前端「请填写图片验证码」 | 003 | `api.auth` 拒无验证码 |
| C02 | 注册 × 两次密码不一致 | 「两次密码不一致」 | 005 | 前端校验；接口另测正常注册 |
| C03 | 短信登录 × 新手机 | 自动建号并发 token | API / e2e | `api.auth` logs in by sms |
| C04 | 微信演示登录 | 「微信游客 · 未绑定手机」 | 066 | `api.auth` wechat demo |
| C05 | 新用户 × 校园表单缺学校 | 「请填写学校全称」 | 008b | `api.eligibility` 要求学校学院证件 |
| C06 | 师生 × 学生证照片 | 待审；后台校园 Tab 可见 | 009 / 018 | `api.notices` 校园待办 |
| C07 | 校友 × 无学号 + 有证件 | 可提交；不享受学生价 | 010 / 011 | `api.eligibility` alumni skip studentNo |
| C08 | 团体（学生组织）× 待审 | 「团体认证审核中」 | 013 / 016 / 019 | `api.notices` 团体 |
| C09 | 领队申请 × 待审 | 待审不能以领队报名 | 015 / 020 | `api.leader` blocks until approve |
| C10 | 公司账号 × 领队通过 | `role` 仍为 company，同时具备领队资格 | 063 | `api.leader` keeps company role |
| C11 | 领队拒绝后再申请 | 允许再提交 | — | `api.leader` rejected can submit again |
| C12 | 认证通过后「我的」 | 学生已认证 / 团体已认证 / 领队已认证 | 024 / 021b | `api.notices` 通过后未读清零 |
| C13 | 非认证用户 × 高校仅北大 | 拦截「去校园认证」 | 035 | `api.eligibility` blocks non-students |
| C14 | 已认证北大师生 × 高校免费报超会抽 | ¥0，可报；状态「已报名待确认」 | 036 / 048 | `api.oversub` campus draw |
| C15 | 外校学生 × 学校名单 | 400 独立拒绝 | — | `api.eligibility` second campus rejected |
| C16 | 高校免费团发布 | 自动 `studentOnly` + `oversub` + 校名 | 047 / 047b / 049 | `api.oversub` turns on draw for free campus |
| C17 | 报超未超座位 | 文案「未超过则全部确认」；未抽签前待确认 | 048 / 049 | `api.oversub` confirms when not over |
| C18 | 报超超过座位 | 抽签；取消后按抽签顺序候补递补 | — | `api.oversub` draws when over |
| C19 | 志愿者领队 × 抽签池 | 不进 pending 池 | — | `api.oversub` volunteer leaders out |
| C20 | 校友 × `alumniOk=0` | 拒绝；`=1` 可报 | 035 文案含校友 | `api.oversub` alumni flag |
| C21 | 个人山野团 × 普通报名 | 先报名后付款，要身份证/紧急联系人/弃权 | 027 / 027b / 030 | `api.enroll` individual |
| C22 | 个人山野团 × 摄影师 | 团费 ¥0，保险另计，本团一位 | 029 | `api.enroll` photographer；`api.home` waive |
| C23 | 同城局 × 姓名+手机 | 不要身份证；免费局直接已报名 | 031 / 032 | `api.enroll` city activity |
| C24 | 同城局 × 摄影师 | 拒绝 | 029b 为同城局轻报名对照 | `api.enroll` / home：活动拒摄影师 |
| C25 | 公司团 × 报名 | 挂账，公司统一支付 | 033 / 034 | `api.enroll` company pending |
| C26 | 公司团 × 任何优惠券 | 400，后台也不可把券挂到公司团 | 038 文案「公司团不可用」 | `api.coupon` rejects company tours |
| C27 | 公开满减券 × 个人团 × 非会员 | 领券后现价减额；与会员取低不叠 | 040–042 | `api.coupon` claim / apply / not stacking |
| C28 | 会员 95 折更便宜 | 跳过券 | — | `api.coupon` skips when member cheaper |
| C29 | 赠团 × 券 | 不核销 | — | `api.coupon` gift trip |
| C30 | 候补 × 券 | 占用；递补核销；取消退券 | — | `api.coupon` waitlist hold |
| C31 | 仅会员券 × 非会员 | 拒绝；定向发放可指定 | 038 发放对象 | `api.coupon` member-only / directed |
| C32 | 高校名单发券 | 按已认证师生筛选发放 | 038 / 038b | `api.coupon` campus roster |
| C33 | 免费券 | 团费可到 0 | — | `api.coupon` free coupon zeros pay |
| C34 | 抽奖未配置 | 用户端回落平台转盘 | 045 / 046 | `api.lottery` 默认奖池 |
| C35 | 抽奖报名前 / 后 / 都抽 | 后台可配；报名后抽须行程结束才领（未签到已付也可行后抽） | 043 / 044 | `api.lottery` 全套 |
| C36 | 指定中奖 + 库存用尽 | 指定人中；其余回落 | 044 | `api.lottery` designated / fallback |
| C37 | 用户发团 | 提交后待审，不上首页 | 060 | `api.home` user publish waits |
| C38 | 后台新增线路 + 发布拼团 | 立即通过 | 047 / 064 | `api.admin` publishes schedule |
| C39 | 组合团 × 非学生/学生组织 | 不能开团 | — | `api.combo` blocks |
| C40 | 导游登录 × 开团前名单 | 手机、身份证打码 | 050–053 | `api.guide` |
| C41 | 后台员工 运营 / 领队 / 摄影 | 运营禁部分 API；领队可锁座；摄影不能动钱和员工 | 022 / 023 | `api.staff` |
| C42 | 退费阶梯 × 开团后 | 出发前按档；正式开团后不退 | 061 | `api.refund` |
| C43 | 满员 | 进候补，不占座；取消后递补 | 058 候补 Tab | `api.waitlist` |
| C44 | 注销 | 同手机可再注册，旧 token 失效 | — | `api.auth` deletes account |

种子数据默认没有优惠券、抽奖配置和高校报超会抽排期。本走查在本地库额外准备：优惠券口令 `M47YUG`（司马台个人团满减 ¥50）、高校排期 id **24**（慕田峪 2026-09-29，仅限北京大学师生校友 · 报超会抽）。

---

## 3. 手动走查（按测试顺序截图）

每条用例一张（或一组）按序号命名的截图。建议按 M-01 → M-66 执行。

### 3.1 注册与登录

**M-01 游客打开「我的」**  
未登录可看权益入口，报名 / 开团需登录。

![M-01](full-tests/screenshots/001_guest_mine.png)

**M-02 密码登录表单**  
演示账号预填 13800138000 / 123456，须填图片验证码。

![M-02](full-tests/screenshots/002_login_form.png)

**M-03 不填验证码点登录**  
红色提示「请填写图片验证码」。

![M-03](full-tests/screenshots/003_login_no_captcha.png)

**M-04 切换到注册**  
昵称、11 位手机、验证码、密码、确认密码；底部微信登录。

![M-04](full-tests/screenshots/004_register_form.png)

**M-05 两次密码不一致**  
填昵称「测」、手机、任意验证码字符、密码 `123456` / 确认 `654321` → 「两次密码不一致」。

![M-05](full-tests/screenshots/005_register_mismatch.png)

**M-06 注册成功**  
手机 `13500001111` 昵称「测试注册生」，「我的」为普通用户、积分 0。校园 / 团体 / 领队均为未认证入口。

![M-06](full-tests/screenshots/006_mine_after_register.png)

**M-07 注册页上的微信登录入口**

![M-07](full-tests/screenshots/007_wechat_login_entry.png)

**M-08 微信演示登录**  
点「微信登录」进入「微信游客 · 未绑定手机」。

![M-08](full-tests/screenshots/066_wechat_mine.png)

### 3.2 校园 / 校友认证

**M-09 校园认证空表**  
身份默认「在读师生」，要学校、学院、学号、学生证照片。

![M-09](full-tests/screenshots/008_student_form.png)

**M-10 空表提交**  
「请填写学校全称」。

![M-10](full-tests/screenshots/008b_student_required.png)

**M-11 师生待审**  
北京大学 · 信息科学技术学院 · 学号 1700012345，状态「审核中」。

![M-11](full-tests/screenshots/009_student_pending.png)

**M-12 改成校友**  
校友不填学号，仍要校友证。

![M-12](full-tests/screenshots/010_alumni_form.png)

**M-13 校友待审（陈小川）**  
北京大学 · 元培学院，「审核中 · 校友」。

![M-13](full-tests/screenshots/011_alumni_pending.png)

### 3.3 团体与领队

**M-14 团体认证表**  
学生组织 / 跑团 / 品牌 / 其他。

![M-14](full-tests/screenshots/012_group_form.png)

**M-15 团体待审**  
「北京大学登山队」，「已提交团体认证，待后台审核」。

![M-15](full-tests/screenshots/013_group_pending.png)

**M-16 领队申请表**  
文案写明：公司账号通过后角色仍是公司，同时具备领队资格。

![M-16](full-tests/screenshots/014_leader_form.png)

**M-17 领队待审**

![M-17](full-tests/screenshots/015_leader_pending.png)

**M-18 新用户「我的」同时待审**  
团体认证审核中、领队申请审核中。

![M-18](full-tests/screenshots/016_mine_certs_pending.png)

**M-19 种子领队账号**  
领队老周：会员、领队已认证。

![M-19](full-tests/screenshots/016b_mine_seed_leader.png)

**M-20 公司账号「我的」**  
华创团建 `13900139000`，会员，公司开团角色（发团选公司团、报名挂账）。

![M-20](full-tests/screenshots/063_company_mine.png)

### 3.4 后台认证审批与员工

**M-21 后台数据看板**  
线路 / 用户 / 报名 / 已收；公司挂账提示去结算。

![M-21](full-tests/screenshots/064_admin_dashboard.png)

**M-22 认证审批 · 全部待审**  
师生（测试注册生）+ 校友（陈小川），证件已上传。

![M-22](full-tests/screenshots/017_admin_verify_all.png)

**M-23 校园 Tab**

![M-23](full-tests/screenshots/018_admin_verify_campus.png)

**M-24 团体 Tab**  
北京大学登山队。

![M-24](full-tests/screenshots/019_admin_verify_group.png)

**M-25 领队 Tab**

![M-25](full-tests/screenshots/020_admin_verify_leader.png)

**M-26 全部通过后待审清空**

![M-26](full-tests/screenshots/017b_admin_verify_after_approve.png)

**M-27 用户与会员列表**

![M-27](full-tests/screenshots/021_admin_users.png)

**M-28 查询新用户**  
校园「已认证 · 北京大学 信息科学技术学院」，团体「北京大学登山队」，领队「已认证」。

![M-28](full-tests/screenshots/021b_admin_user_student.png)

**M-29 通过后用户端「我的」**  
学生已认证、团体已认证、领队已认证。

![M-29](full-tests/screenshots/024_mine_after_approve.png)

**M-30 校园页已认证师生**

![M-30](full-tests/screenshots/009b_student_approved.png)

**M-31 管理员账号列表**  
超级管理员；运营 / 领队 / 摄影权限见文案。

![M-31](full-tests/screenshots/022_admin_staff.png)

**M-32 新增后台账号**  
角色默认「运营」。

![M-32](full-tests/screenshots/023_admin_staff_create.png)

### 3.5 会员、首页、三种团报名

**M-33 开通会员**  
年费 99、95 折、赠一次 100 元内团。

![M-33](full-tests/screenshots/025_member_page.png)

**M-34 首页团列表**  
筛选：公司 / 高校 / 个人；玩法标签；发团入口。

![M-34](full-tests/screenshots/026_home_trips.png)

**M-35 个人山野团报名空表**  
司马台，要身份证、紧急联系人、弃权（滚到底）。

![M-35](full-tests/screenshots/027_enroll_outdoor.png)

**M-36 未填身份证提交**  
前端拦截（本帧与空身份证对照）。

![M-36](full-tests/screenshots/028_enroll_outdoor_validation.png)

**M-37 填好身份证**

![M-37](full-tests/screenshots/027b_enroll_filled.png)

**M-38 报名身份改摄影师**  
「免个人团费，保险另计。本团只设一位摄影师。」应付 ¥0。

![M-38](full-tests/screenshots/029_enroll_photographer.png)

**M-39 个人团已成团详情**  
林北野已在司马台成团名单（种子报名）。

![M-39](full-tests/screenshots/030_enroll_success.png)

**M-40 同城局轻报名（会员）**  
周五夜掼蛋局：只要姓名和手机。

![M-40](full-tests/screenshots/031_activity_enroll.png)

**M-41 同城局轻报名（非会员陈小川）**  
同一套姓名+手机，证明同城局不区分会员价字段。

![M-41](full-tests/screenshots/029b_photographer_query.png)

**M-42 同城局报名成功**  
「已报名。到场时找发起人即可。」

![M-42](full-tests/screenshots/032_activity_enroll_success.png)

**M-43 公司团报名**  
华创账号报慕田峪公司场：「由北京华创科技有限公司统一支付」。

![M-43](full-tests/screenshots/033_company_enroll.png)

**M-44 公司团行程**  
「公司统一微信支付」、已成团、可解散。

![M-44](full-tests/screenshots/034_company_pending_pay.png)

### 3.6 高校资格 × 报超会抽（组合）

**M-45 林北野（未做北大认证）打开高校团**  
应付 ¥0，但红字「本团仅限 北京大学 已认证师生或校友报名 去校园认证」。

![M-45](full-tests/screenshots/035_campus_blocked.png)

**M-46 已认证师生打开同一团**  
「仅限北京大学师生校友 已认证师生或校友」，表单可填。

![M-46](full-tests/screenshots/036_campus_enroll_ok.png)

**M-47 后台发布拼团对话框**  
类型可改高校；开关：仅师生、允许校友、报超会抽；限定高校 / 学院。

![M-47](full-tests/screenshots/047_oversub_admin_publish.png)

**M-48 拼团列表出现高校场**  
慕田峪 2026-09-29，组织「高校」，限制「仅限北京大学师生校友 · 报超会抽」。

![M-48](full-tests/screenshots/047b_admin_schedules_campus.png)

**M-49 认证师生报名后**  
免费团、已报 1/10 · 报超会抽、发起「平台管理员（北京大学）」、黑卡「已报名待确认」。

![M-49](full-tests/screenshots/048_oversub_enroll_pending.png)

**M-50 后台人数变成 0/10 +1待确认**  
抽签未执行前，待确认不计正式座位。

![M-50](full-tests/screenshots/049_admin_draw_confirm.png)

### 3.7 优惠券

**M-51 优惠券列表**  
口令 `M47YUG`，司马台个人团减 ¥50，公开领取。文案写明公司团不可用。库存走查中会从 20 减到 19。

![M-51](full-tests/screenshots/037_admin_coupons.png)

**M-52 点发行**

![M-52](full-tests/screenshots/038_admin_coupon_create.png)

**M-53 发行对话框字段**  
指定行程 / 通用券；公开 / 仅会员 / 定向；指定必领；高校名单；折扣 / 直减 / 免费。

![M-53](full-tests/screenshots/038b_admin_coupon_dialog.png)

**M-54 刚发行成功（库存 20/20）**

![M-54](full-tests/screenshots/039_admin_coupon_created.png)

**M-55 用户领券页**  
「全量测试满减券 减¥50」，团价 214 → 券后 164。

![M-55](full-tests/screenshots/040_coupon_claim.png)

**M-56 券包**  
陈小川未用一张。

![M-56](full-tests/screenshots/041_coupons_wallet.png)

**M-57 报名页已带券**  
「已带优惠券 减¥50，团费 ¥164（保险另计）」。

![M-57](full-tests/screenshots/040b_coupon_claimed.png)

![M-57b](full-tests/screenshots/042_enroll_with_coupon.png)

公司团发券 / 报名带券的失败路径由 `api.coupon.test.js` 的 22 条覆盖，后台对话框已写「公司团不可用」，不再做一张失败 PNG。

### 3.8 抽奖

**M-58 后台抽奖列表**  
未配置的团显示「未配置」；本走查给慕田峪 09-29 配了「报名前 · 本团抽奖」。

![M-58](full-tests/screenshots/043_admin_lottery.png)

**M-59 配置奖池**  
报名前 / 报名后 / 前后都抽；积分与实物；指定中奖在说明里。

![M-59](full-tests/screenshots/044_admin_lottery_config.png)

**M-60 用户端抽奖（未配团则平台转盘）**  
报名前一次，交费且行程结束后再抽第二次，不必签到。

![M-60](full-tests/screenshots/045_lottery_list.png)

![M-60b](full-tests/screenshots/046_lottery_wheel.png)

### 3.9 导游端

**M-61 导游登录**  
13700001101 + 图片验证码。

![M-61](full-tests/screenshots/050_guide_login.png)

**M-62 林晓峰行程**  
已匹配司马台、慕田峪等。

![M-62](full-tests/screenshots/051_guide_home.png)

**M-63 带团详情**  
正式开团、按休息点签到、天气、车牌与本团群。

![M-63](full-tests/screenshots/052_guide_schedule.png)

**M-64 游客详情（开团前打码）**  
手机 `138****8000`，身份证中间打码。

![M-64](full-tests/screenshots/053_guide_traveler.png)

### 3.10 后台运营其余页、用户端其余入口

**M-65 报名与收款**  
真实用户与虚拟用户混排，支付/报名状态可筛。

![M-65](full-tests/screenshots/054_admin_enrollments.png)

**M-66 客服与规则**  
官方微信、学生认证、领队申请、报名前抽奖入口。

![M-66](full-tests/screenshots/055_official_rules.png)

**M-67 行程 Tab**  
待出行 / 候补 / 历史；同城局与山野团分标签。

![M-67](full-tests/screenshots/058_orders.png)

**M-68 收藏空态**

![M-68](full-tests/screenshots/059_favorites.png)

**M-69 用户发团**  
提交后需管理员审核；类型可选户外线路或同城局。

![M-69](full-tests/screenshots/060_publish_entry.png)

**M-70 全局退费规则**  
10 天 100%、3 天 80%、当天未开团 50%、正式开团后不退。

![M-70](full-tests/screenshots/061_admin_refund.png)

**M-71 玩法标签**  
徒步、登山、玩水、亲子、摄影等，发团时可勾。

![M-71](full-tests/screenshots/062_admin_tags.png)

---

## 4. 自动化全表（325 条，一次跑完）

按文件的 `it(` 计数。逐条英文名称见 [full-tests/AUTOMATED.md](./full-tests/AUTOMATED.md)。

### 4.1 服务端 HTTP / 领域（272）

| 文件 | 条数 | 模块 |
| --- | ---: | --- |
| `api.auth.test.js` | 9 | 注册登录、短信建号、微信、注销 |
| `api.admin.test.js` | 7 | 看板、线路、排期、成本、封面 |
| `api.combo.test.js` | 2 | 组合团资格 |
| `api.coupon.test.js` | 22 | 优惠券全组合 |
| `api.dissolve.test.js` | 4 | 解散退款 |
| `api.eligibility.test.js` | 11 | 高校 / 学院 / 校友 / 证件 |
| `api.enroll.test.js` | 16 | 个人/公司/同城局/摄影师/满员 |
| `api.guide.test.js` | 1 | 导游登录签到 |
| `api.home.test.js` | 6 | 首页、发团待审、同城局不进线路 |
| `api.insurance.test.js` | 1 | 保险加价 |
| `api.leader.test.js` | 3 | 领队审批与公司角色 |
| `api.lottery.test.js` | 9 | 抽奖时机、指定中奖、库存 |
| `api.notices.test.js` | 4 | 认证待办 |
| `api.oversub.test.js` | 6 | 报超会抽 |
| `api.pay.test.js` | 7 | mock / JSAPI / 会员 |
| `api.pulse.test.js` | 6 | 首页动态脱敏 |
| `api.refund.test.js` | 3 | 退费档 |
| `api.reviews.test.js` | 4 | 评价资格 |
| `api.routes.test.js` | 7 | 线路排期分享 |
| `api.seats.test.js` | 2 | 选座 |
| `api.social.test.js` | 9 | 主页、推荐、虚拟用户 |
| `api.split.test.js` | 1 | 公司分账 |
| `api.staff.test.js` | 7 | 后台账号权限 |
| `api.supplies.test.js` | 1 | 补给 |
| `api.trip.test.js` | 4 | 锁座、公开主页 |
| `api.waitlist.test.js` | 2 | 候补递补 |
| `app.test.js` | 1 | SPA |
| `auth.middleware.test.js` | 13 | JWT 角色隔离 |
| `biz.test.js` | 13 | 会员价、积分、脱敏 |
| `captcha.test.js` | 3 | 图片验证码 |
| `config.test.js` | 1 | 测试目录 |
| `coupons.service.test.js` | 5 | 折扣计算 |
| `db.test.js` | 3 | 映射与 trade_no |
| `helpers.service.test.js` | 10 | 报价成团 |
| `idcard.test.js` | 10 | 身份证 |
| `image-helpers.test.js` | 6 | 封面 |
| `oversub.service.test.js` | 1 | 抽签 rng |
| `policy.test.js` | 2 | 装备与免责 |
| `refund.test.js` | 3 | 退费匹配 |
| `route-draft.test.js` | 22 | 线路起草 |
| `routes-data.test.js` | 7 | 30 条线数据 |
| `story.service.test.js` | 4 | 图文 |
| `video.test.js` | 6 | 视频地址 |
| `weather.test.js` | 2 | 天气 |
| `wechat.test.js` | 6 | 微信会话与支付 XML |

### 4.2 H5 工具函数（53）

`activityKind` 4、`auth` 3、`chinaAreas` 6、`couponTime` 3、`feedCard` 3、`feedList` 6、`media` 3、`pulse` 1、`routeMeta` 6、`scanFacts` 5、`share` 3、`story` 2、`trips` 4、`weatherChart` 2、`wechatPay` 2。

`feedList` 覆盖首页公司 / 高校 / 个人筛选，与 M-34 对应。

---

## 5. 小程序对照

`miniprogram/` 打同一套 API。本走查截图在 H5；小程序用微信开发者工具按相同顺序点即可，不必重复 70 张 PNG。

| H5 | 小程序页 |
| --- | --- |
| `/m/login` | `pages/login/login` |
| `/m/mine` | `pages/mine/mine` |
| `/m/student` | `pages/student/student` |
| `/m/leader` | `pages/leader/leader` |
| `/m/enroll/:id` | `pages/enroll/enroll` |
| `/m/publish` | `pages/publish/publish` |
| `/m/coupons` | `pages/coupons/coupons` |
| `/m/lottery` | `pages/lottery/lottery` |
| `/g` | `pages/guide/guide` |
| 后台 | 仅 Web `/admin` |

真机调试 HTTP IP 时关闭「校验合法域名」。真实 JSAPI 支付只在小程序内完成（H5 会提示去小程序）。

---

## 6. 发团专项

用户端入口见 M-69。官方「新增线路 → 发布拼团」与用户发团待审的逐步截图，见 PR [#57](https://github.com/xiangxiang222/bj-outdoor-trip/pull/57)。合入后读 `docs/PUBLISH_TEST_CASES.md`。

要点：

- 后台 `POST /admin/routes`（`status=on`）再 `POST /admin/schedules`：立即通过。
- 用户 `POST /trips`：待审，线路号 `U…`。
- 同城局 `channel=activity` 不上首页线路 Tab。

---

## 7. 建议回归顺序（上线前）

1. `npm test`（325 条，隔离临时库）。
2. `npm run test:coverage`（行/语句/函数 80%，分支 65%）。
3. 按本文 M-01 → M-71 点一遍三端（本地 `npm run dev`）。
4. `npm run test:e2e` 或 `npm run test:e2e:live`（不要对生产 `--unsafe`）。
5. 发团走 PR #57 的官方发布路径。

线上演示站 `http://192.144.167.212` 可做只读对照，不要在生产 seed，也不要解散全部拼团。
