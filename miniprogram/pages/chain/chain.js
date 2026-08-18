const { request } = require("../../utils/request");
Page({
  data: { list: [] },
  onShow() {
    request("/schedules")
      .then((r) => this.setData({ list: r.data || [] }))
      .catch(() => this.setData({ list: [] }));
  },
  go(e) { wx.navigateTo({ url: "/pages/schedule/schedule?id=" + e.currentTarget.dataset.id }); },
});
