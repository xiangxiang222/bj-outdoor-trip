const { request, setAuth, showError } = require("../../utils/request");
const { genderText, maskPhone } = require("../../utils/labels");
const app = getApp();

Page({
  data: { user: {}, idCard: "", realName: "", gender: "", phone: "", verifying: false, errors: {} },
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
  setName(e) {
    this.setData({ realName: e.detail.value, "errors.name": "" });
  },
  setId(e) {
    this.setData({ idCard: e.detail.value, "errors.idCard": "" });
  },
  async save() {
    if (this.data.verifying) return;
    const realName = String(this.data.realName || "").trim();
    const idCard = String(this.data.idCard || "").trim().toUpperCase();
    if (!realName) {
      this.setData({ "errors.name": "请填写真实姓名" });
      return;
    }
    if (!/^\d{17}[\dX]$/.test(idCard)) {
      this.setData({ "errors.idCard": "请填写 18 位身份证号" });
      return;
    }
    this.setData({ errors: {}, verifying: true });
    try {
      const res = await request("/me/realname", "POST", { realName, idCard });
      setAuth(app.globalData.token, res.data);
      this.fill(res.data);
      this.setData({ idCard: "", realName: "" });
      wx.showToast({ title: "已通过实名核验", icon: "none" });
    } catch (e) {
      showError("核验失败", e);
    } finally {
      this.setData({ verifying: false });
    }
  },
});
