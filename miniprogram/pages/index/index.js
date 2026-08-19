const { request } = require("../../utils/request");
const lite = require("../../data/routes-lite");
const { withLocalMediaList, detailUrl } = require("../../utils/media");

function asList(rows) {
  return Array.isArray(rows) && rows.length ? rows : [];
}

function buildCalendar(schedules) {
  const days = [];
  const now = new Date();
  for (let i = 0; i < 10; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0");
    const count = schedules.filter((s) => s.startDate === key && s.status !== "cancelled").length;
    days.push({ date: key, label: d.getMonth() + 1 + "/" + d.getDate(), count });
  }
  return days;
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
    upcoming: null,
    calendar: [],
    allSchedules: [],
  },
  onLoad() {
    this.applyRoutes(asList(lite));
    this.load();
  },
  onShow() {
    this.loadUpcoming();
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
      const allSchedules = asList(schRes.data);
      const groups = allSchedules
        .filter((s) => s.status !== "cancelled" && Number(s.remain) > 0)
        .slice(0, 4);
      this.setData({ groups, allSchedules, calendar: buildCalendar(allSchedules) });
      await this.loadUpcoming();
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
  async loadUpcoming() {
    const app = getApp();
    if (!app.globalData.token) {
      this.setData({ upcoming: null });
      return;
    }
    try {
      const res = await request("/me/trips");
      const list = asList(res.data);
      this.setData({ upcoming: list[0] || null });
    } catch (err) {
      this.setData({ upcoming: null });
    }
  },
  goUpcoming() {
    const u = this.data.upcoming;
    if (u && u.scheduleId) wx.navigateTo({ url: "/pages/schedule/schedule?id=" + u.scheduleId });
  },
  goDay(e) {
    const date = e.currentTarget.dataset.date;
    const count = Number(e.currentTarget.dataset.count || 0);
    if (!count) return;
    const hit = (this.data.allSchedules || []).find((s) => s.startDate === date && s.status !== "cancelled");
    if (hit) wx.navigateTo({ url: "/pages/schedule/schedule?id=" + hit.id });
    else wx.switchTab({ url: "/pages/chain/chain" });
  },
});
