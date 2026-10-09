const { request, setAuth } = require("../../utils/request");
const { saveCaptchaFile } = require("../../utils/captcha");
Page({
  data: {
    account: false,
    tab: "login",
    phone: "",
    password: "",
    password2: "",
    nickname: "",
    captcha: "",
    captchaToken: "",
    captchaImage: "",
    captchaLoading: false,
    smsMode: false,
    smsCode: "",
    smsWait: 0,
    smsNote: "",
    redirect: "",
    statusBarHeight: 20,
    errors: {},
  },
  onLoad(q) {
    const direct = q.tab === "register" || q.account === "1";
    this.directAccount = direct;
    let statusBarHeight = 20;
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      statusBarHeight = info.statusBarHeight || 20;
    } catch (e) {}
    this.setData({
      redirect: q.redirect ? decodeURIComponent(q.redirect) : "",
      tab: q.tab === "register" ? "register" : "login",
      account: direct,
      statusBarHeight,
    });
    if (direct && q.tab !== "register") this.loadCaptcha();
  },
  setTab(e) {
    const tab = e.currentTarget.dataset.tab;
    const next = tab === "register" ? "register" : "login";
    this.setData({ tab: next, errors: {}, smsNote: "" });
    if (next === "login" && !this.data.smsMode) this.loadCaptcha();
  },
  setSmsMode(e) {
    const smsMode = e.currentTarget.dataset.on === "1";
    this.setData({ smsMode, errors: {}, smsNote: "" });
    if (!smsMode) this.loadCaptcha();
  },
  setSmsCode(e) { this.setData({ smsCode: e.detail.value, "errors.smsCode": "" }); },
  async sendSms(e) {
    if (this.data.smsWait) return;
    const phone = String(this.data.phone || "").trim();
    if (!/^1\d{10}$/.test(phone)) {
      this.setData({ "errors.phone": phone ? "手机号不正确" : "请填写手机号" });
      return;
    }
    const scene = (e.currentTarget.dataset.scene === "register") ? "register" : "login";
    try {
      const res = await request("/auth/sms", "POST", { phone, scene });
      this.setData({ smsNote: (res && res.message) || "验证码已发送", smsWait: 60, "errors.phone": "" });
      clearInterval(this._smsTimer);
      this._smsTimer = setInterval(() => {
        const left = this.data.smsWait - 1;
        this.setData({ smsWait: left > 0 ? left : 0 });
        if (left <= 0) clearInterval(this._smsTimer);
      }, 1000);
    } catch (err) {
      wx.showModal({ title: "发送失败", content: (err && err.message) || "请稍后重试", showCancel: false });
    }
  },
  onUnload() {
    clearInterval(this._smsTimer);
  },
  setPhone(e) { this.setData({ phone: e.detail.value, "errors.phone": "" }); },
  setPwd(e) { this.setData({ password: e.detail.value, "errors.password": "" }); },
  setPwd2(e) { this.setData({ password2: e.detail.value, "errors.password2": "" }); },
  setNickname(e) { this.setData({ nickname: e.detail.value, "errors.nickname": "" }); },
  setCaptcha(e) { this.setData({ captcha: e.detail.value, "errors.captcha": "" }); },
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
    wx.showModal({ title: "验证码加载失败", content: "请点击图片重试", showCancel: false });
  },
  async after(res) {
    setAuth(res.data.token, res.data.user);
    const redirect = this.data.redirect;
    const path = (redirect || "").split("?")[0];
    const tabs = ["/pages/index/index", "/pages/activities/activities", "/pages/orders/orders", "/pages/mine/mine"];
    if (tabs.includes(path)) {
      wx.switchTab({ url: path });
      return;
    }
    if (redirect && (redirect.startsWith("/pages/") || redirect.startsWith("/pkg-detail/"))) {
      wx.redirectTo({ url: redirect, fail: () => wx.switchTab({ url: "/pages/mine/mine" }) });
      return;
    }
    wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/mine/mine" }) });
  },
  async smsLogin() {
    const errors = {};
    const phone = String(this.data.phone || "").trim();
    if (!phone) errors.phone = "请填写手机号";
    else if (!/^1\d{10}$/.test(phone)) errors.phone = "手机号不正确";
    if (!/^\d{6}$/.test(this.data.smsCode || "")) errors.smsCode = "请填写短信验证码";
    if (Object.keys(errors).length) {
      this.setData({ errors });
      return;
    }
    this.setData({ errors: {} });
    try {
      await this.after(await request("/auth/login-sms", "POST", { phone, code: this.data.smsCode }));
    } catch (e) {
      wx.showModal({ title: "登录失败", content: (e && e.message) || "请稍后重试", showCancel: false });
    }
  },
  async pwdLogin() {
    const errors = {};
    const phone = String(this.data.phone || "").trim();
    if (!phone) errors.phone = "请填写手机号";
    else if (!/^1\d{10}$/.test(phone)) errors.phone = "手机号不正确";
    if (!this.data.password) errors.password = "请填写密码";
    if (!(this.data.captcha || "").trim()) errors.captcha = "请填写图片验证码";
    if (Object.keys(errors).length) {
      this.setData({ errors });
      return;
    }
    this.setData({ errors: {} });
    try {
      await this.after(await request("/auth/login", "POST", {
        phone: this.data.phone,
        password: this.data.password,
        captchaToken: this.data.captchaToken,
        captcha: this.data.captcha.trim(),
      }));
    } catch (e) {
      this.loadCaptcha();
      wx.showModal({ title: "登录失败", content: (e && e.message) || "请稍后重试", showCancel: false });
    }
  },
  async register() {
    const errors = {};
    const phone = String(this.data.phone || "").trim();
    if (!(this.data.nickname || "").trim()) errors.nickname = "请填写昵称";
    if (!phone) errors.phone = "请填写手机号";
    else if (!/^1\d{10}$/.test(phone)) errors.phone = "手机号不正确";
    if (!/^\d{6}$/.test(this.data.smsCode || "")) errors.smsCode = "请填写短信验证码";
    if (!this.data.password || String(this.data.password).length < 6) errors.password = "密码至少 6 位";
    if (this.data.password !== this.data.password2) errors.password2 = "两次密码不一致";
    if (Object.keys(errors).length) {
      this.setData({ errors });
      return;
    }
    this.setData({ errors: {} });
    try {
      await this.after(await request("/auth/register", "POST", {
        phone: this.data.phone,
        password: this.data.password,
        nickname: this.data.nickname.trim(),
        smsCode: this.data.smsCode,
      }));
    } catch (e) {
      wx.showModal({ title: "注册失败", content: e.message, showCancel: false });
    }
  },
  cancel() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/mine/mine" }) });
  },
  backAuth() {
    if (this.directAccount) {
      wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/mine/mine" }) });
      return;
    }
    this.setData({ account: false, errors: {} });
  },
  showAccount() {
    this.setData({ account: true, tab: "login" });
    this.loadCaptcha();
  },
  async onGetPhone(e) {
    const detail = (e && e.detail) || {};
    if (detail.errMsg && detail.errMsg.indexOf("ok") < 0) return;
    if (!detail.code) {
      wx.showModal({ title: "登录失败", content: "没有拿到手机号授权", showCancel: false });
      return;
    }
    try {
      wx.showLoading({ title: "登录中", mask: true });
      const login = await wx.login();
      await this.after(await request("/auth/wechat-phone", "POST", {
        loginCode: login.code,
        phoneCode: detail.code,
      }));
    } catch (err) {
      wx.showModal({ title: "登录失败", content: (err && err.message) || "请稍后重试", showCancel: false });
    } finally {
      wx.hideLoading();
    }
  },
});
