const { request, setAuth, showError } = require("../../utils/request");
const { genderText, maskPhone } = require("../../utils/labels");
const app = getApp();

Page({
  data: { user: {}, idCard: "", gender: "", phone: "" },
  onShow() {
    this.fill(app.globalData.user || {});
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/profile/profile") });
      return;
    }
    request("/me")
      .then((res) => {
        setAuth(app.globalData.token, res.data);
        this.fill(res.data);
      })
      .catch((e) => showError("加载失败", e));
  },
  fill(user) {
    this.setData({
      user,
      gender: genderText(user.gender) || "待补充",
      phone: maskPhone(user.phone),
    });
  },
  setId(e) {
    this.setData({ idCard: e.detail.value });
  },
  async save() {
    try {
      const res = await request("/me", "PUT", { idCard: this.data.idCard });
      setAuth(app.globalData.token, res.data);
      this.fill(res.data);
      this.setData({ idCard: "" });
      wx.showToast({ title: "已保存", icon: "none" });
    } catch (e) {
      showError("保存失败", e);
    }
  },
});
