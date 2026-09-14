# 发布行程 · 全量测试用例

本文把「发布行程」从入口到上架的用例收成一份：自动化对照、手工步骤、以及本次本地走查每个界面的截图。

**官方线路目录由后台发布，不是用户发团。** 后台「线路管理 → 新增线路」写入 `routes.status=on`，立刻出现在用户端首页「线路」Tab（`GET /api/routes` 只返回 `status='on'`）。要让人报名，再在「拼团与成本 → 发布拼团」给这条线挂排期（`POST /api/admin/schedules`，`reviewStatus=approved`，立刻可报）。

用户端「发团」是另一条路：`POST /api/trips` 会新建一条 `status=pending` 的线路（编号 `U…`）和待审排期，后台点通过后才上首页「团」。不要把它和后台发布官方线路混在一起。

范围：

1. **后台发布线路**（主路径）：`/admin/routes` 新增 / 编辑 / 上架 / 下架。`POST/PUT /api/admin/routes`，可 AI 起草。
2. **后台发布拼团**：`/admin/schedules`「发布拼团」。立即通过，用户端可报名。
3. **用户发新线路 / 发团**：H5 `/m/publish`（`POST /api/trips`），`review_status=pending`，后台通过才上首页「团」。
4. **发起同城局**：`/m/publish?channel=activity`，通过后上活动 Tab，不上首页线路目录。
5. **已有线路发布排期**：线路详情「发布排期」`/m/open/:id`（`POST /api/schedules`），立即通过，可报名。

小程序对应页：`pages/publish/publish`、`pages/open/open`。用户端截图在 H5 演示壳（430px）；后台截图在桌面宽度（1440px）。微信开发者工具需另行打开真机预览。

## 0. 环境与账号

| 项 | 值 |
| --- | --- |
| 本次走查 | 2026-09-13，本地 `npm run dev`（API 3780，H5 3781） |
| 用户 | `13800138000` / `123456`（林北野，会员） |
| 后台 | `admin` / `admin123`，打开 `/admin/login` |
| 图片验证码 | 用户登录页点图刷新；自动化用 `GET /api/auth/captcha` |
| 种子库 | `npm run seed`（会清空本地 `server/data/app.sqlite`） |
| 不要 | 在生产跑 `npm run seed` |

相关接口：`POST /admin/routes`、`POST /admin/routes/draft`、`PUT /admin/routes/:id`、`DELETE /admin/routes/:id`（下架）、`POST /admin/schedules`、`POST /admin/schedules/:id/review`、`POST /trips`、`POST /schedules`、`POST /upload`，说明见 `docs/API.md`。

```
后台登录 → 线路管理 → 新增线路 → 保存（status=on）
        ↓
  用户端首页「线路」立刻能搜到
        ↓
  拼团与成本 → 发布拼团（选线路、日期、车型）
        ↓
  排期立即 approved，详情出现「立即报名」
```

```
用户未登录点发团 → 登录（带 redirect）
        ↓
  选类型：户外 / 同城局 → POST /trips（线路 status=pending）
        ↓
  详情票卡「已提交审核」          ↘ 驳回：详情「未通过审核」
        ↓
  后台「拼团与成本」点通过 → 线路改为 on；户外上首页「团」
```

---

## 1. 自动化用例对照

以下为仓库里已经覆盖发布/开团/审核的测试。本次抽跑相关项均通过（服务端 7 条过滤用例 + H5 `scanFacts` / `auth` / `feedList` 14 条）。

### 1.1 服务端

| 编号 | 用例名 | 文件 | 断言要点 |
| --- | --- | --- | --- |
| A-01 | user publish waits for review and then appears | `server/test/api.home.test.js` | `POST /trips` → `reviewStatus=pending`；公开列表没有；报名 400；管理员 `approved` 后出现在 `GET /schedules`；可带 B 站视频 |
| A-02 | city activities stay off the trip list and route catalog | 同上 | `channel=activity` 审核后只出现在 `?channel=activity`；不进 `GET /routes`、不进首页轮播 |
| A-03 | city activity enrolls with name and phone only | `server/test/api.enroll.test.js` | 发同城局并审核后，姓名+手机即可报，不强制身份证 |
| A-04 | keeps activity enrollments off the home ticker | `server/test/api.pulse.test.js` | 同城局报名不上首页动态条 |
| A-05 | blocks opening a combo trip unless student/org | `server/test/api.combo.test.js` | 未认证学生 `offerType=combo` 返回 400 |
| A-06 | keeps combo rule when a user publishes a limited trip | `server/test/api.eligibility.test.js` | 认证学生发组合团，规则与高校名单写进排期 |
| A-07 | restricts enrollment to a college… | 同上 | `POST /schedules` + `campusScope=college`，外院 400，组织者可加学院；另有绑定组合与同名学院用例 |
| A-08 | creates individual and company schedules | `server/test/api.routes.test.js` | 空 body 400；个人开团成功；公司无名称 400；高校无校名 400；有校名成功 |
| A-09 | persists limits when admin publishes a trip | `server/test/api.eligibility.test.js` | 后台发团写入仅学生 / 高校名单 |
| A-10 | persists oversub and alumni flags when admin publishes | `server/test/api.oversub.test.js` | 后台发团写入报超会抽、校友 |
| A-11 | turns on draw for a free campus trip | 同上 | 高校免费团默认抽签 + 仅该校 |
| A-12 | attaches a campaign when publishing with lotteryMode | `server/test/api.lottery.test.js` | 后台发团 `lotteryMode=pre` 挂上抽奖 |
| A-13 | admin publishes schedule, updates cost… | `server/test/api.admin.test.js` | 后台 `POST /admin/schedules` |
| A-14 | admin can publish and dissolve a group | `server/test/api.dissolve.test.js` | 后台发团后可解散 |
| A-15 | e2e「H5 页面可打开」含 `/m/publish` | `scripts/e2e.js` | 页面 200 |
| A-16 | drafts route copy without a model key | `server/test/api.admin.test.js` | `POST /admin/routes/draft` 未配 `AI_API_KEY` 用模板；空标题 400 |
| A-17 | creates updates and off-shelves a route | 同上 | `POST /admin/routes` 写入阶梯价/车型/视频；`PUT` 改介绍与行程；`DELETE` 下架后公开 `GET /routes` 没有 |

未登录发团由鉴权中间件返回 401（`authUser`），H5 侧由 `requireLogin` 先跳登录。

### 1.2 用户端（Vitest）

| 编号 | 用例名 | 文件 | 断言要点 |
| --- | --- | --- | --- |
| F-01 | 未登录替换到 `/m/login?redirect=` | `web/src/utils/auth.test.js` | 发团页 `onMounted` 走同一套 |
| F-02 | 已登录放行 | 同上 | |
| F-03 | pending + 发起人 / `?posted=1` → 票卡「已提交审核」 | `web/src/utils/scanFacts.test.js` | |
| F-04 | 已通过时忽略 `?posted=1` | 同上 | 避免审核后仍显示待审票 |
| F-05 | pending / rejected 不展示报名 CTA | `canShowEnroll` | |
| F-06 | `isListable` 丢掉未通过审核的团 | `web/src/utils/feedList.test.js` | 待审不上首页 feed |

---

## 2. 手工用例 · 后台发布线路（官方目录）

期望列写的是产品行为。后台截图 1440×900，用户端 430px。本次后台走查新增线路标题为「百花山一日徒步（后台发布）」。

### TC-A01 打开管理后台并登录

**步骤**：打开 `/admin/login`，账号 `admin` / `admin123`。  
**期望**：卡片标题「同行者众 · 管理后台」；默认账号写在登录按钮下。

![后台登录](publish-tests/screenshots/41_admin_login_desktop.png)

---

### TC-A02 数据看板与侧栏入口

**步骤**：登录后进入 `/admin`。  
**期望**：KPI 含线路数；左侧「经营」里有 **线路管理**、**拼团与成本**。点「线路管理」进入 `/admin/routes`。

![数据看板](publish-tests/screenshots/42_admin_dashboard.png)

---

### TC-A03 线路管理列表

**步骤**：打开 `/admin/routes`。  
**期望**：表格有封面、编号（种子线 `R01`…）、标题、天数、类型、地区、成团、状态 `on`、操作「编辑 / 评价 / 下架」。右上角绿色 **新增线路**。

![线路管理列表](publish-tests/screenshots/43_admin_routes_list.png)

用户发团产生的待审线会出现在表尾，编号 `U…`、状态 `pending`，不会出现在用户端「线路」Tab，直到对应拼团被通过。

---

### TC-A04 新增线路：默认 AI 起草

**步骤**：点 **新增线路**。  
**期望**：弹窗标题「新增线路」；填写方式默认「AI 起草」；上架开关默认开；有标题、副标题、天数、类型、地区、补充、**生成文案和图片**、难度/季节/里程/成团/标签。未配 `AI_API_KEY` 时提示用模板写文案。

![新增线路 · 侧栏+弹窗](publish-tests/screenshots/44_admin_create_route_overlay.png)

![新增线路 · AI 起草首屏](publish-tests/screenshots/45_admin_create_route_ai_top.png)

---

### TC-A05 不填标题点保存

**步骤**：弹窗内直接点 **保存**。  
**期望**：顶部红字「请填写标题」，弹窗不关。

![请填写标题](publish-tests/screenshots/46_admin_create_title_required.png)

接口侧至少还要一档人数价、一种车型（A-17）。前端同样拦：没阶梯价「请至少填一档人数价」；没勾车型「请勾选至少一种车型」。

---

### TC-A06 切到手动填写

**步骤**：填写方式点「手动」。  
**期望**：AI 补充/生成按钮消失；下面直接是照片、介绍等区块，适合从空白手填。

![手动填写](publish-tests/screenshots/47_admin_create_route_manual_top.png)

---

### TC-A07 AI 起草填入文案和照片

**步骤**：切回 AI 起草；标题填「百花山一日徒步（后台发布）」；地区选「北京市 / 门头沟区」；补充「徒步、避暑、不走夜路」；点 **生成文案和图片**。  
**期望**：绿条「已用模板起草，请核对后再保存」（有模型 Key 时为「已用 AI 起草」）。类型、难度、季节、标签、副标题被填上。

![起草完成](publish-tests/screenshots/49_admin_create_after_draft_toast.png)

---

### TC-A08 核对照片、介绍、行程、价格、退费

**步骤**：在弹窗内向下滚。

**照片**：封面、相册、B 站/YouTube/mp4 视频链接。

![照片](publish-tests/screenshots/51_admin_create_photos.png)

**介绍**：介绍正文、亮点列表、图文交错。

![介绍](publish-tests/screenshots/52_admin_create_intro.png)

**行程**：每站时间 / 标题 / 说明 / 配图。

![行程](publish-tests/screenshots/53_admin_create_itinerary.png)

**价格与车型**：默认四档阶梯价（10/20/30/50 人）和会员价；至少勾一辆车。发团时只能从这里勾过的车型里选。

![价格与车型](publish-tests/screenshots/54_admin_create_price_bus.png)

**集合点 / 费用与须知 / 退费**：可加常用集合点；退费默认同全局规则，也可本线路单独设置。

![集合点与退费](publish-tests/screenshots/56_admin_create_fees_refund.png)

---

### TC-A09 保存后列表出现且已上架

**步骤**：点 **保存**。  
**期望**：绿条「已保存」；表尾出现该线，状态 `on`，有封面。用户端不用再审。

![保存后列表滚到新线路](publish-tests/screenshots/57_admin_routes_after_save.png)

![新线路这一行](publish-tests/screenshots/57b_admin_new_route_row.png)

点 **下架** 走 `DELETE /admin/routes/:id`，状态改 `off`，公开目录不再展示（A-17）。已有拼团还在。

---

### TC-A10 编辑已有官方线路

**步骤**：在列表点慕田峪「编辑」。  
**期望**：弹窗标题「编辑线路」；填写方式为手动；标题/副标题/地区/标签/封面已在；可改介绍、行程、阶梯价、可选车型、集合点。点保存走 `PUT /admin/routes/:id`。

![编辑慕田峪 · 基本信息](publish-tests/screenshots/59_admin_edit_mutianyu_top.png)

![编辑慕田峪 · 相册](publish-tests/screenshots/60_admin_edit_mutianyu_photos.png)

![编辑慕田峪 · 介绍](publish-tests/screenshots/61_admin_edit_mutianyu_intro.png)

![编辑慕田峪 · 行程](publish-tests/screenshots/62_admin_edit_mutianyu_itinerary.png)

![编辑慕田峪 · 价格与集合点](publish-tests/screenshots/63_admin_edit_mutianyu_price.png)

---

### TC-A11 后台为线路发布拼团

**步骤**：侧栏 **拼团与成本** → **发布拼团** → 选刚保存的线路、出发日、车型、集合点 → **发布**。  
**期望**：空表先要选线路；提交 `POST /admin/schedules` 后立即 `approved`（没有「待审」）。列表出现该团，组织者显示后台账号名。

![拼团列表](publish-tests/screenshots/64_admin_schedules_list.png)

![发布拼团空表](publish-tests/screenshots/66_admin_publish_schedule_form.png)

![选中新线路并填日期](publish-tests/screenshots/67_admin_publish_schedule_filled.png)

![发布后列表出现该团，无待审标记](publish-tests/screenshots/68_admin_schedules_after_publish.png)

不选线路点发布会失败（「线路不存在」）。公司/高校开团还要填名称（与 A-08 / A-09 相同）。

---

### TC-A12 用户端线路 Tab 能看到，排期可报名

**步骤**：打开 `/m` → 切到 **线路** → 搜索刚发布的标题。  
**期望**：目录文案「官方线路。点进去看介绍，有排期就能报」；卡片有封面、标题、地区、会员价。点进详情；有排期时打开行程详情，底栏 **立即报名**（无需再审）。

![首页线路 Tab 搜到后台发布的线](publish-tests/screenshots/72_home_catalog_search_new_route.png)

![目录卡片](publish-tests/screenshots/72b_home_catalog_card.png)

![线路详情](publish-tests/screenshots/73_route_detail_admin_published.png)

![图文介绍](publish-tests/screenshots/74_route_detail_admin_published_mid.png)

![后台发布的排期可立即报名](publish-tests/screenshots/76_schedule_admin_published_enroll.png)

---

### TC-A13 用户发团在后台的通过 / 驳回

**步骤**：用户发团后打开「拼团与成本」，把表横向滑到操作列（线路、出发钉在左侧）。  
**期望**：待审行状态「· 待审」，操作列出现绿色 **通过**、橙色 **驳回**。通过后线路 `pending → on`，团出现在首页「团」；驳回后详情「未通过审核」。

![待审行的通过 / 驳回](publish-tests/screenshots/69_admin_schedules_ops_pass_reject.png)

这是审用户发团，不是发布官方线路。官方线路用 TC-A04～TC-A11，没有待审。

---

## 3. 手工用例 · 用户发团 / 同城局 / 线路排期

用户端入口。官方目录仍以后台为准（上一节）。截图来自本次本地走查。

### TC-01 未登录从首页进发团，先登录

**目的**：发团必须登录，登录后能回到发布页。  
**步骤**：打开 `/m` → 点「看看最近都在忙什么」右侧 **发团**。  
**期望**：进入 `/m/login?redirect=/m/publish`；标题「登录 / 注册」；演示号已填。

![首页发团入口](publish-tests/screenshots/01_home_guest_entry.png)

![未登录跳到登录](publish-tests/screenshots/02_login_redirect_from_publish.png)

登录成功后应打开 `/m/publish`（本次后续步骤用演示账号 token 注入，等价于密码+验证码登录）。

---

### TC-02 已登录首页仍能看到发团

**步骤**：登录后打开 `/m`。  
**期望**：工具条仍有荧光绿「发团」。

![已登录首页发团](publish-tests/screenshots/03_home_logged_in_publish_btn.png)

---

### TC-03 我的 → 去发团 / 发起一局

**步骤**：底栏「我的」→ 滚到「服务」。  
**期望**：有「去发团 / 发起一局」，进入 `/m/publish`。

![我的入口](publish-tests/screenshots/04_mine_go_publish.png)

---

### TC-04 活动 Tab「发起一局」

**步骤**：底栏「活动」。  
**期望**：英雄区「发起一局」、工具条「发起」；点开后 URL 带 `channel=activity`。

![活动 Tab 入口](publish-tests/screenshots/05_activities_start_entry.png)

---

### TC-05 进行中的团「发团」芯片

**步骤**：打开 `/m/chain`。  
**期望**：顶栏筛选旁有「发团」，进入发布页。

![进行中的团](publish-tests/screenshots/31_chain_publish_chip.png)

---

### TC-06 户外发团表单首屏

**步骤**：登录后打开 `/m/publish`。  
**期望**：类型默认「户外线路（上首页）」；可匹配已有线路；标题 / 副标题 / 封面 / 天数 / 城市 / 玩法标签 / 团型。顶栏副文案「提交后需管理员审核」。

![户外表单上部](publish-tests/screenshots/06_publish_outdoor_top.png)

![玩法与团型](publish-tests/screenshots/07_publish_outdoor_tags_offer.png)

---

### TC-07 匹配已有线路

**步骤**：在「匹配已有线路」输入「慕田峪」。  
**期望**：出现线路芯片；点选后标题、副标题、封面、城市被带入。

![匹配结果](publish-tests/screenshots/12_publish_match_route_hits.png)

![选用后回填](publish-tests/screenshots/13_publish_after_match_route.png)

---

### TC-08 组合团附加字段

**步骤**：团型改为「组合团」。  
**期望**：出现「另一半身份」「另一半学校」；未认证学生提交会被接口拒绝（A-05）。

![组合团](publish-tests/screenshots/14_publish_combo_extra_fields.png)

---

### TC-09 校园范围

**步骤**：看「校园范围」；改为「仅本校」。  
**期望**：出现学校输入；提示「本校各学院可报」。选项还有：不限制 / 仅已认证师生 / 仅本学院 / 本校跨学院 / 跨学校。跨学校时每条是一组学校-学院-专业，不是学校名单再并一套学院名。

![校园范围与高校开团](publish-tests/screenshots/17_publish_campus_org_school_field.png)

![仅本校时的学校字段](publish-tests/screenshots/40_publish_campus_scope_school.png)

---

### TC-10 价格、组织类型、车型、集合、抽奖

**步骤**：继续下滚户外表单。  
**期望**：会员价/学生价/报超会抽；出发日期；个人/公司/高校开团；车型；成团人数；四个固定集合点；介绍；B 站视频链接；抽奖四档；主按钮「提交审核」。

![价格与校园范围默认](publish-tests/screenshots/08_publish_outdoor_campus_org.png)

![车型与集合](publish-tests/screenshots/09_publish_outdoor_bus_meetup.png)

![抽奖与提交](publish-tests/screenshots/10_publish_outdoor_lottery_submit.png)

---

### TC-11 公司开团不填名称

**步骤**：组织类型选「公司开团」，公司名称留空，点提交审核。  
**期望**：红字「公司开团请填写公司名称」，不跳转。

![公司名称](publish-tests/screenshots/15_publish_company_name_field.png)

![校验文案](publish-tests/screenshots/16_publish_company_name_required.png)

高校开团不填学校同理：「高校开团请填写学校」（接口 A-08）。

---

### TC-12 填完整户外团并提交

**步骤**：标题「测试发布慕田峪徒步」，城市「怀柔」，出发日约 10 天后，玩法点「徒步」，点提交审核。  
**期望**：进入行程详情 `?posted=1`；紫票「已提交审核」；有「去分享」；**没有**「立即报名」；提示暂不能报名。

![提交前标题](publish-tests/screenshots/18_publish_outdoor_filled_top.png)

![待审票卡](publish-tests/screenshots/19_schedule_pending_ticket.png)

![无报名按钮](publish-tests/screenshots/20_schedule_pending_no_enroll.png)

---

### TC-13 待审团不上首页

**步骤**：回首页，搜索刚提交的标题。  
**期望**：feed 空态「还没有符合条件的团」，可「去发团」。发起人详情仍可打开（直链）。

![首页搜不到待审团](publish-tests/screenshots/21_home_pending_not_in_feed.png)

---

### TC-14 同城局表单与地点必填

**步骤**：活动 Tab「发起一局」，或 `/m/publish?channel=activity&kind=掼蛋`。  
**期望**：玩法四宫格（掼蛋/跑步/电影/招募）；地点、城区、日期、时间、人数、费用；地点空提交 → 「请填写地点」。

![同城局表单](publish-tests/screenshots/22_publish_activity_kinds.png)

![地点校验](publish-tests/screenshots/24_publish_activity_place_required.png)

---

### TC-15 提交同城局

**步骤**：地点填「三里屯太古里南区」，标题「测试周五夜掼蛋」，提交。

![同城局填完](publish-tests/screenshots/25_publish_activity_filled.png)

**期望**：局详情待审票；文案「通过后才会出现在活动页，暂不能报名」。活动列表仍是原来的 4 场，**没有**这条待审局。

![同城局待审票](publish-tests/screenshots/26_activity_pending_ticket.png)

![活动列表无待审](publish-tests/screenshots/27_activities_pending_hidden.png)

---

### TC-16 已有线路发布排期（立即可报）

**步骤**：线路详情（如慕田峪 R01）滚到底 → **发布排期** → 填出发日 → 发布排期。  
**期望**：进入行程详情，**直接**有底栏「立即报名」，没有待审票。这是 `POST /schedules`，`reviewStatus=approved`。

![线路详情发布排期](publish-tests/screenshots/28_route_detail_open_schedule_btn.png)

![发布排期表单](publish-tests/screenshots/29_open_schedule_form.png)

![提交后可报名](publish-tests/screenshots/30_open_schedule_live_detail.png)

---

### TC-17 后台看到待审并操作

用户发团（不是后台新增线路）之后：`/admin/login` → 拼团与成本，横向滑到操作列。  
**期望**：用户发团状态带「· 待审」；操作列「通过 / 驳回」。通过后首页「团」能搜到；驳回后详情「未通过审核」。完整后台发布官方线路见 TC-A01～TC-A12。

![后台登录](publish-tests/screenshots/32_admin_login.png)

![待审行在列表中](publish-tests/screenshots/33_admin_schedules_pending.png)

![操作列：通过 / 驳回](publish-tests/screenshots/69_admin_schedules_ops_pass_reject.png)

本次走查：户外「测试发布慕田峪徒步」点通过；同城局「测试周五夜掼蛋」点驳回（状态「· 驳回」）。

---

### TC-18 审核通过后首页可报名

**步骤**：首页搜索「测试发布慕田峪徒步」；点进详情。  
**期望**：feed 出现该团；详情底栏价格 + **立即报名**；待审票消失。

![通过后出现在首页](publish-tests/screenshots/36_home_after_review_search.png)

![通过后可报名](publish-tests/screenshots/37_schedule_after_review.png)

---

### TC-19 审核驳回后不上活动 Tab

**步骤**：打开被驳回的局详情；再看活动列表。  
**期望**：详情红字「本团未通过审核」；活动 Tab 仍无该局。

![驳回详情](publish-tests/screenshots/38_activity_after_review.png)

![活动列表仍无该局](publish-tests/screenshots/39_activities_after_review.png)

---

## 4. 补充用例（接口/规则，界面已在上面覆盖字段）

这些与表单选项对应，适合自动化或发完后再报一名测试号验证。

| 编号 | 场景 | 期望 |
| --- | --- | --- |
| TC-20 | 未登录直接 `POST /trips` | 401 |
| TC-21 | 户外不填标题 / 不填出发日 | 400「请填写线路标题」/「请选择出发日期」 |
| TC-22 | 价格 `< 0` | 400「价格不正确」 |
| TC-23 | 不选车型且不是同城局 | 400「请选择车型」（同城局会回落到座位数最少的车型） |
| TC-24 | 封面上传非图片或超过 5MB | 400 |
| TC-25 | 非法视频链接 | 线路页不嵌播放器（见 `video.test.js`） |
| TC-26 | 合法 B 站 BV 链接 | 详情/线路可嵌 iframe（A-01） |
| TC-27 | `lotteryMode=pre/enroll/both` | 详情出现对应抽奖文案 |
| TC-28 | 天数 `multi` | 线路天数按 5 日写库 |
| TC-29 | 同城局费用 > 0 | `offerType` 按收费团，不是免费 |
| TC-30 | 高校+免费团 | 自动报超会抽、校园范围收到学校（A-11） |
| TC-31 | 待审团任何人报名 | 400「该团正在审核或未通过」 |
| TC-32 | 驳回团报名 | 同上 |
| TC-33 | 发起人待审详情可「去分享」 | 分享链能打开预览，列表仍隐藏 |
| TC-34 | 发起人可解散自己待审团 | 详情「解散拼团」 |
| TC-35 | 日历空日点发团 | `/m/publish?date=YYYY-MM-DD` 出发日预填 |
| TC-36 | 活动空态按玩法「去发起」 | `/m/publish?channel=activity&kind=跑步` 等 |
| TC-37 | 小程序未登录进 publish | 跳转登录并带 redirect |
| TC-38 | 小程序提交成功 | `redirectTo` 详情 `posted=1` |
| TC-39 | 后台「发布拼团」 | 立即 approved，见 TC-A11 |
| TC-40 | 重复审核 | 以最后一次 `review_status` 为准 |
| TC-41 | 后台新增线路不填标题 | 前端「请填写标题」（TC-A05） |
| TC-42 | 后台新增线路无阶梯价 / 无车型 | 「请至少填一档人数价」/「请勾选至少一种车型」 |
| TC-43 | 后台下架线路 | `DELETE` 后 `status=off`，`GET /routes` 没有（A-17）；已有拼团仍在 |
| TC-44 | 后台 AI 起草空标题 | 400「请先填标题」/ 接口「标题」（A-16） |
| TC-45 | 用户发团产生的 `U…` 线 | 状态 `pending`，首页「线路」没有，直到对应拼团通过 |

---

## 5. 小程序对照

| H5 | 小程序 |
| --- | --- |
| `/m/publish` | `pages/publish/publish` 标题「发团」 |
| `?channel=activity&kind=` | 同 query |
| `/m/open/:id` | `pages/open/open` |
| 日期原生 `type=date` | 60 天 picker |
| 封面 `<input type=file>` | 小程序发布页当前无封面上传，标题/城市/标签/团型/抽奖均有 |
| 提交 `router.push` | `wx.redirectTo` 详情 |

未在微信开发者工具里截图；逻辑与 H5 共用同一套 API。

---

## 6. 本次走查结论

| 项 | 结果 |
| --- | --- |
| 后台登录、看板、线路管理列表 | 通过 |
| 新增线路：空标题校验、AI 起草、照片/介绍/行程/价格/退费、保存后 `on` | 通过 |
| 编辑已有官方线路（慕田峪） | 通过 |
| 后台发布拼团后用户端立刻可报名 | 通过 |
| 用户端首页「线路」能搜到后台刚发的线 | 通过 |
| 用户发团入口（首页 / 我的 / 活动 / 进行中的团 / 线路发布排期） | 通过 |
| 未登录拦截 | 通过 |
| 户外提交 → 待审票 → 首页搜不到 → 后台通过 → 可报名 | 通过 |
| 同城局地点校验、待审不上活动 Tab、驳回后仍不出现 | 通过 |
| 已有线路发布排期立即出现报名底栏 | 通过 |
| 公司开团名称校验 | 通过 |
| 相关自动化（含 A-16 / A-17 后台线路） | 对照已有测试 |

走查中为跑通种子数据，修正了 `server/src/seed/run.js`：支付单号改为 `MOCK{scheduleId}-{enrollmentId}`，避免同一毫秒 `MOCK${Date.now()}${idx}` 撞上 `payments.trade_no` 唯一索引导致 `npm run seed` 失败（与线上 #54 同一类问题）。
