const { request, showError } = require("../../utils/request");

Page({
  data: { pinSet: false, realNamed: false, pin: "", pin2: "", oldPin: "", idCard: "", resetPin: "" },
  onShow() {
    this.load();
  },
  async load() {
    try {
      const res = await request("/me/wallet");
      this.setData({ pinSet: !!(res.data && res.data.pinSet), realNamed: !!(res.data && res.data.realNamed) });
    } catch (e) {
      showError("加载失败", e);
    }
  },
  setOld(e) {
    this.setData({ oldPin: e.detail.value });
  },
  setPin(e) {
    this.setData({ pin: e.detail.value });
  },
  setPin2(e) {
    this.setData({ pin2: e.detail.value });
  },
  setId(e) {
    this.setData({ idCard: e.detail.value });
  },
  setReset(e) {
    this.setData({ resetPin: e.detail.value });
  },
  async save() {
    if (this.data.pin !== this.data.pin2) {
      wx.showToast({ title: "两次密码不一致", icon: "none" });
      return;
    }
    try {
      await request("/me/wallet/pin", "POST", { pin: this.data.pin, oldPin: this.data.oldPin });
      wx.showToast({ title: "已保存", icon: "none" });
      this.setData({ pin: "", pin2: "", oldPin: "", pinSet: true });
    } catch (e) {
      showError("保存失败", e);
    }
  },
  async reset() {
    try {
      await request("/me/wallet/pin/reset", "POST", { idCard: this.data.idCard, pin: this.data.resetPin });
      wx.showToast({ title: "已重置", icon: "none" });
      this.setData({ idCard: "", resetPin: "" });
    } catch (e) {
      showError("重置失败", e);
    }
  },
});
