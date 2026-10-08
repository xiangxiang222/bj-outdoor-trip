const { request, setAuth, showError } = require("../../utils/request");
const { genderText, maskPhone } = require("../../utils/labels");
const app = getApp();

const PENDING_KEY = "bj_realname_pending";
const AUTH_APPID = "wx308bd2aeb83d3345";
const AUTH_PATH = "subPages/city/wxpay-auth/main";

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
        this.consumeAuthCode();
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
  consumeAuthCode() {
    const code = app.globalData.realnameCode || "";
    if (!code || this.data.verifying) return;
    const pending = wx.getStorageSync(PENDING_KEY) || {};
    if (!pending.realName || !pending.idCard) return;
    app.globalData.realnameCode = "";
    this.submit(pending.realName, pending.idCard, code);
  },
  async save() {
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
    this.setData({ errors: {} });
    wx.setStorageSync(PENDING_KEY, { realName, idCard });
    try {
      const login = await wx.login();
      if (login && login.code) {
        const bound = await request("/auth/wechat", "POST", { code: login.code });
        if (bound && bound.data && bound.data.user) setAuth(app.globalData.token, bound.data.user);
      }
    } catch (e) {
      showError("微信登录失败", e);
      return;
    }
    wx.navigateToMiniProgram({
      appId: AUTH_APPID,
      path: AUTH_PATH,
      fail: (err) => {
        wx.showModal({ title: "无法打开微信授权页", content: (err && err.errMsg) || "请稍后重试", showCancel: false });
      },
    });
  },
  async submit(realName, idCard, code) {
    this.setData({ verifying: true });
    try {
      const res = await request("/me/realname", "POST", { realName, idCard, code });
      wx.removeStorageSync(PENDING_KEY);
      setAuth(app.globalData.token, res.data);
      this.fill(res.data);
      this.setData({ idCard: "", realName: "" });
      wx.showToast({ title: "已通过微信实名核验", icon: "none" });
    } catch (e) {
      showError("核验失败", e);
    } finally {
      this.setData({ verifying: false });
    }
  },
});
