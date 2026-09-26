const appearance = require("../../utils/appearance");

Page({
  data: { look: {}, copy: {}, fonts: appearance.FONTS, fontFamily: appearance.FONTS.system, previewScale: 1 },
  onShow() {
    const look = appearance.read();
    wx.setNavigationBarTitle({ title: appearance.t(look).fontTitle });
    this.setData({ look, copy: appearance.t(look), fontFamily: appearance.FONTS[look.font] });
  },
  pickFont(e) {
    const look = appearance.write({ font: e.currentTarget.dataset.font });
    this.setData({ look, fontFamily: appearance.FONTS[look.font] });
  },
  setSize(e) {
    const look = appearance.write({ size: Number(e.detail.value) });
    this.setData({ look });
  },
});
