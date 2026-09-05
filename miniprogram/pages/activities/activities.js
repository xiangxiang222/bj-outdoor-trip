const { request } = require("../../utils/request");
const { KINDS, isThisWeek, decorate } = require("../../utils/activity-kind");

Page({
  data: { rows: [], list: [], kinds: KINDS, kind: "", weekCount: 0 },
  onShow() {
    request("/schedules?channel=activity")
      .then((r) => {
        const rows = ((r && r.data) || []).map(decorate);
        this.setData({ rows, weekCount: rows.filter((s) => isThisWeek(s.startDate)).length });
        this.apply();
      })
      .catch(() => this.setData({ rows: [], list: [], weekCount: 0 }));
  },
  apply() {
    const kind = this.data.kind;
    const list = kind ? this.data.rows.filter((s) => s.kindLabel === kind) : this.data.rows;
    this.setData({ list });
  },
  setKind(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ kind: this.data.kind === key ? "" : key });
    this.apply();
  },
  go(e) {
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + e.currentTarget.dataset.id });
  },
  goPublish() {
    const app = getApp();
    const kind = this.data.kind;
    const url = "/pages/publish/publish?channel=activity" + (kind ? "&title=" + encodeURIComponent(kind) : "");
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent(url) });
      return;
    }
    wx.navigateTo({ url });
  },
});
