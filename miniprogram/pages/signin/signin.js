const { request, showError } = require("../../utils/request");

Page({
  data: { state: null, result: null },
  onShow() {
    this.load();
  },
  async load() {
    try {
      const res = await request("/me/signin");
      this.setData({ state: res.data });
    } catch (e) {
      showError("加载失败", e);
    }
  },
  async sign() {
    if (this.data.state && this.data.state.signedToday) return;
    try {
      const res = await request("/me/signin", "POST", {});
      this.setData({ state: res.data, result: res.data.already ? null : res.data });
    } catch (e) {
      showError("签到失败", e);
    }
  },
  closeResult() {
    this.setData({ result: null });
  },
  noop() {},
});
