const { request } = require("../../utils/request");

Page({
  data: { trips: [], loaded: false },
  onShow() {
    this.load();
  },
  async load() {
    try {
      const res = await request("/schedules?photoOpen=1&channel=trip");
      const trips = (res.data || []).map((s) => ({
        id: s.id,
        title: (s.route && s.route.title) || "",
        cover: (s.route && s.route.cover) || "",
        startDate: s.startDate || "",
      }));
      this.setData({ trips, loaded: true });
    } catch {
      this.setData({ trips: [], loaded: true });
    }
  },
  open(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + id });
  },
});
