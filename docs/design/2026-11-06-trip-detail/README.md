# 团详情：领队、摄影师与天气

2026-11-06，小程序与 H5 同步调整。

- 角色区使用白底分隔行，浅紫图标、角色名称、说明与右侧报名入口；已占用时显示姓名并查看资料。保留两位领队与一位摄影师的业务入口，摄影师明确“免个人团费，保险另计”。
- 天气合为单层卡片，日期、地点、天气、温度分层；显示风速与降水，使用紫色细线、淡填充和短降水柱。仅关键时段标注温度，底部保留出行提醒。
- 适配中英文、夜间模式和大字号。没有新增图片资源或外部依赖。

预览：[小程序日间](./mini-light.png)、[小程序夜间](./mini-dark.png)、[H5 页面](./h5-light.png)。小程序图片基于实际 WXML/WXSS/WXS 与 canvas 的浏览器兼容模拟，不是微信真机截图；H5 使用实际页面组件及模拟接口数据。

验证：小程序包检查通过；相关既有页面/分享测试 79 项、Web 测试 372 项通过，H5 构建通过；浏览器回归 64 项及 65 个路由渲染检查通过。[布局报告](./layout-report.json) 包含 96 组宽度、字号、语言、主题与占用状态检查，无横向溢出或遮挡。

```sh
npm run check:miniprogram
npm run build
MINI_SCHEDULE_ARTIFACT_DIR=/tmp/mini-schedule-layout node scripts/check-mini-schedule-layout.cjs
```

尚未发布，未验证 iPhone 微信真机显示。
