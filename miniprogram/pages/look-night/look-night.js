const appearance = require("../../utils/appearance");

Page({
  data: { look: {}, copy: {} },
  onShow() {
    const look = appearance.read();
    wx.setNavigationBarTitle({ title: appearance.t(look).nightTitle });
    this.setData({ look, copy: appearance.t(look) });
  },
  pick(e) {
    const look = appearance.write({ night: e.currentTarget.dataset.night });
    this.setData({ look });
  },
});
