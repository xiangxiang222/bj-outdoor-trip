# 一句话找团 · 首期接口与交互约定

开发协作约定。只读找真实山野团；不发布、占座、报名或支付。不改普通筛选、图片外移、通用加载组件和部署流程。

## 请求

`POST /api/discovery/search`（允许游客，登录时按当前账号核验），body：

```json
{
  "message": "下周末长城，200元内，新手，想参加跨校团",
  "filters": null,
  "limit": 3,
  "offset": 0
}
```

首次提交 message 由服务端解析（有可用模型时可辅助理解，未配置或失败使用诚实标示的规则匹配）。后续编辑条件、查看更多提交完整 filters，不重新用原 message 覆盖：

```json
{
  "time": "any",
  "dateFrom": "",
  "dateTo": "",
  "budgetMax": null,
  "partySize": 1,
  "destination": "",
  "intensity": "any",
  "hostKind": "any",
  "campusScope": "any"
}
```

time：any / weekend / nextweekend / date / range。服务端计算北京时间周末并返回真实 dateFrom/dateTo；date 为同一天，range 含首尾。budgetMax：null 或非负元数，0 必须保留，**只表示每人团费上限**，不伪称含一切费用。partySize：1–50，用于人数/余位判断，不承诺统一代报名。destination：0–40 字。intensity：any / easy（只匹配明确休闲标签并说明资料来源，不能保证适合所有新手）。hostKind：any / official / campus / company / individual。campusScope：any / cross（匹配实际跨校/已认证高校联谊，不能把本校团当跨校团）。limit 1–30，offset 非负。

输入缺失/非法条件 400，可理解 message；限流 429。模型调用超时限制在原生 request 15秒以内，约8秒回退，先有可用的规则结果。响应不包含模型密钥或完整个人资料。

## 响应

沿用 `{ok:true,data:{...}}`：

`mode` 为 `model` 或 `rules`，分别表示实际采用了模型解析或使用规则/用户确认的筛选条件。

```json
{
  "mode": "rules",
  "filters": {},
  "conditions": [{"key":"time","label":"下周末 · 11.07–11.08"}],
  "warnings": ["预算按每人团费筛选，餐饮、门票等另付项目请查看费用说明。"],
  "question": "",
  "total": 2,
  "results": [],
  "hasMore": false,
  "nextOffset": 2
}
```

每个 result：

```json
{
  "id": 1,
  "routeId": 1,
  "title": "真实线路名",
  "cover": "/static/...jpg",
  "region": "怀柔",
  "startDate": "2026-11-07",
  "endDate": "2026-11-07",
  "meetupTime": "07:30",
  "meetupPoint": "东直门",
  "days": 1,
  "distanceKm": null,
  "difficulty": "休闲",
  "price": {"amount":199,"label":"当前人均团费","note":"以报名页实时核算为准"},
  "remain": 12,
  "participation": {"status":"available","label":"可查看报名","reason":""},
  "eligibilityLabel": "高校联谊 · 需校园认证",
  "feeInclude": "线路已填写的费用包含说明",
  "feeExclude": "线路已填写的费用不含说明",
  "reasons": ["在所选出发日期内"],
  "cautions": ["步行距离待核实，请先看线路安排"],
  "detailPath": "/m/schedule/1"
}
```

participation.status：available / verify / waitlist / applied / ineligible / login。明确不符合范围者不混入可推荐结果；需认证/抽签/候补清晰标示。游客可看公开结果，认证后再检查学校、学院、专业。不得返回私密口令、名单、电话、凭证、订单。

## 两端体验

首页搜索附近一行轻入口「说说你想怎么玩」。打开专用发现页（H5 `/m/discover`；原生 `pages/discover/discover`），保留普通筛选入口。浅紫/白卡片/细线图标，文字入口不加素材，不替换原Logo。

初始示例：本周末轻徒步 / 下周末长城，团费200元内 / 想参加跨校团。输入框最大400字。提交后展示服务端确认的可编辑日期、目的地、团费上限、人数、强度、团型、跨校偏好；“修改条件”展开表单，应用重新查询。首次3个真实团；查看更多按同一已确认条件加载。比较已展示的2–3项，使用响应里的事实，缺失写“暂未提供”。不发起另一轮模型编造比较结论。

显示规则降级时用「已按描述整理条件」，不用虚假的“AI已深度分析”。warnings/question需展示，歧义让用户改条件确认。空结果不自动放宽；可分别明确清除日期/预算/范围。报错保留输入与上次结果并可重试；取消过期请求/序号保护。每次操作提供真实请求状态与重复点击保护，不修改通用加载组件。

导航回首页用原路由/Tab，不在首页强塞不受支持的预算或资格条件。英文源文案统一交 root 处理 locale-en.json，再执行生成脚本。
