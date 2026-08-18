const { request, setAuth } = require("../../utils/request");
const { saveCaptchaFile } = require("../../utils/captcha");
Page({
  data: {
    tab: "login",
    phone: "13800138000",
    password: "123456",
    password2: "",
    nickname: "",
    captcha: "",
    captchaToken: "",
    captchaImage: "",
    captchaLoading: false,
    redirect: "",
  },
  onLoad(q) {
    this.setData({
      redirect: q.redirect ? decodeURIComponent(q.redirect) : "",
      tab: q.tab === "register" ? "register" : "login",
    });
    if (q.tab === "register") this.clearDemo();
    this.loadCaptcha();
  },
  clearDemo() {
    const patch = { tab: "register" };
    if (this.data.phone === "13800138000") patch.phone = "";
    if (this.data.password === "123456") patch.password = "";
    this.setData(patch);
  },
  setTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === "register") this.clearDemo();
    else this.setData({ tab: "login" });
    this.loadCaptcha();
  },
  setPhone(e) { this.setData({ phone: e.detail.value }); },
  setPwd(e) { this.setData({ password: e.detail.value }); },
  setPwd2(e) { this.setData({ password2: e.detail.value }); },
  setNickname(e) { this.setData({ nickname: e.detail.value }); },
  setCaptcha(e) { this.setData({ captcha: e.detail.value }); },
  async loadCaptcha() {
    this.setData({ captchaLoading: true, captchaImage: "" });
    try {
      const res = await request("/auth/captcha?t=" + Date.now());
      const filePath = await saveCaptchaFile(res.data.image, this._captchaFile);
      this._captchaFile = filePath;
      this.setData({
        captchaImage: filePath,
        captchaToken: res.data.token,
        captcha: "",
        captchaLoading: false,
      });
    } catch (e) {
      this.setData({ captchaLoading: false });
      wx.showModal({ title: "验证码加载失败", content: e.message, showCancel: false });
    }
  },
  onCaptchaError() {
    wx.showToast({ title: "验证码图片加载失败，请点击刷新", icon: "none" });
  },
  async after(res) {
    setAuth(res.data.token, res.data.user);
    const redirect = this.data.redirect;
    if (redirect && (redirect.startsWith("/pages/") || redirect.startsWith("/pkg-detail/"))) {
      wx.redirectTo({ url: redirect, fail: () => wx.switchTab({ url: "/pages/mine/mine" }) });
      return;
    }
    wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/mine/mine" }) });
  },
  async pwdLogin() {
    if (!(this.data.captcha || "").trim()) {
      wx.showToast({ title: "请填写图片验证码", icon: "none" });
      return;
    }
    try {
      await this.after(await request("/auth/login", "POST", {
        phone: this.data.phone,
        password: this.data.password,
        captchaToken: this.data.captchaToken,
        captcha: this.data.captcha.trim(),
      }));
    } catch (e) {
      this.loadCaptcha();
      wx.showToast({ title: e.message, icon: "none" });
    }
  },
  async register() {
    if (!(this.data.nickname || "").trim()) {
      wx.showToast({ title: "请填写昵称", icon: "none" });
      return;
    }
    if (!(this.data.captcha || "").trim()) {
      wx.showToast({ title: "请填写图片验证码", icon: "none" });
      return;
    }
    if (this.data.password !== this.data.password2) {
      wx.showToast({ title: "两次密码不一致", icon: "none" });
      return;
    }
    try {
      await this.after(await request("/auth/register", "POST", {
        phone: this.data.phone,
        password: this.data.password,
        nickname: this.data.nickname.trim(),
        captchaToken: this.data.captchaToken,
        captcha: this.data.captcha.trim(),
      }));
    } catch (e) {
      this.loadCaptcha();
      wx.showModal({ title: "注册失败", content: e.message, showCancel: false });
    }
  },
  async wxLogin() {
    try {
      const login = await wx.login();
      await this.after(await request("/auth/wechat", "POST", { code: login.code, nickname: "微信用户" }));
    } catch (e) {
      wx.showToast({ title: e.message, icon: "none" });
    }
  },
});
