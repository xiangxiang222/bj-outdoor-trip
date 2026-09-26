const appearance = require("../../utils/appearance");

Page({
  data: { look: {}, copy: {} },
  onShow() {
    const look = appearance.read();
    wx.setNavigationBarTitle({ title: appearance.t(look).langTitle });
    this.setData({ look, copy: appearance.t(look) });
  },
  pick(e) {
    const look = appearance.write({ lang: e.currentTarget.dataset.lang });
    const copy = appearance.t(look);
    wx.setNavigationBarTitle({ title: copy.langTitle });
    this.setData({ look, copy });
  },
});
