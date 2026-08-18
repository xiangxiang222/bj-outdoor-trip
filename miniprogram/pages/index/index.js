const { request } = require("../../utils/request");
const lite = require("../../data/routes-lite");
const { withLocalMediaList, detailUrl } = require("../../utils/media");

function asList(rows) {
  return Array.isArray(rows) && rows.length ? rows : [];
}

Page({
  data: {
    theme: null,
    groups: [],
    weekend: [],
    durations: [
      { n: 1, hint: "当天往返" },
      { n: 2, hint: "过夜一晚" },
      { n: 3, hint: "小长假" },
      { n: 5, hint: "深度出省" },
    ],
    places: ["长城", "玩水", "登山", "山水", "文化", "草原", "海滨"],
    err: "",
  },
  onLoad() {
    this.applyRoutes(asList(lite));
    this.load();
  },
  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },
  applyRoutes(rows) {
    const raw = withLocalMediaList(asList(rows));
    const theme = raw.find((r) => r.days === 3) || raw.find((r) => r.days === 2) || raw[0] || null;
    const weekend = raw.filter((r) => r.days === 1).slice(0, 4);
    this.setData({ theme, weekend, err: raw.length ? "" : "暂无线路" });
  },
  async load() {
    try {
      const [routesRes, schRes] = await Promise.all([
        request("/routes"),
        request("/schedules").catch(() => ({ data: [] })),
      ]);
      const rows = asList(routesRes.data);
      if (rows.length) this.applyRoutes(rows);
      else if (!this.data.theme) this.applyRoutes(asList(lite));
      const groups = asList(schRes.data)
        .filter((s) => s.status !== "cancelled" && Number(s.remain) > 0)
        .slice(0, 4);
      this.setData({ groups });
    } catch (err) {
      if (!this.data.theme) this.applyRoutes(asList(lite));
      if (!this.data.theme) this.setData({ err: (err && err.message) || "加载失败" });
    }
  },
  goDays(e) {
    const app = getApp();
    app.globalData.routeFilter = { days: Number(e.currentTarget.dataset.n) || 0, category: "全部" };
    wx.switchTab({ url: "/pages/routes/routes" });
  },
  goPlace(e) {
    const app = getApp();
    app.globalData.routeFilter = { days: 0, category: e.currentTarget.dataset.c };
    wx.switchTab({ url: "/pages/routes/routes" });
  },
  goTheme() {
    const id = this.data.theme && this.data.theme.id;
    if (id) wx.navigateTo({ url: detailUrl(id) });
  },
  goRoute(e) {
    wx.navigateTo({ url: detailUrl(e.currentTarget.dataset.id) });
  },
  goGroup(e) {
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + e.currentTarget.dataset.id });
  },
  goChain() {
    wx.switchTab({ url: "/pages/chain/chain" });
  },
  goAllOneDay() {
    const app = getApp();
    app.globalData.routeFilter = { days: 1, category: "全部" };
    wx.switchTab({ url: "/pages/routes/routes" });
  },
  goOpen() {
    wx.switchTab({ url: "/pages/routes/routes" });
  },
  goMember() {
    wx.navigateTo({ url: "/pages/member/member" });
  },
});
