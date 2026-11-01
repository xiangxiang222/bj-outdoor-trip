const { request, setAuth } = require("../../utils/request");
const { saveCaptchaFile } = require("../../utils/captcha");
const { validateLegalBundle, legalGuardMessage, legalAuthPayload } = require("../../utils/legal");
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
    legalBundle: null,
    legalLoading: true,
    legalError: "",
    legalAccepted: false,
    legalAllowed: false,
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
    this.loadLegal();
    if (direct && q.tab !== "register") this.loadCaptcha();
  },
  async loadLegal() {
    if (this._legalPending) return;
    this._legalPending = true;
    this.setData({ legalLoading: true, legalError: "", legalBundle: null, legalAccepted: false, legalAllowed: false });
    try {
      const legalBundle = validateLegalBundle((await request("/legal")).data);
      this.setData({ legalBundle, legalAllowed: legalBundle.status === "draft" });
    } catch (e) { this.setData({ legalError: e.message || "协议加载失败，请重试" }); }
    finally { this._legalPending = false; this.setData({ legalLoading: false }); }
  },
  toggleLegal(e) {
    const legalAccepted = (e.detail.value || []).indexOf("accepted") >= 0;
    this.setData({ legalAccepted, legalAllowed: !!this.data.legalBundle && (this.data.legalBundle.status === "draft" || legalAccepted) });
  },
  checkLegal() {
    const message = legalGuardMessage(this.data.legalBundle, this.data.legalAccepted);
    if (message) { wx.showToast({ title: message, icon: "none" }); return false; }
    return true;
  },
  legalPayload() { return legalAuthPayload(this.data.legalBundle, this.data.legalAccepted); },
  async handleLegalError(error) {
    if (!error || ["legal_version_changed", "legal_version_conflict"].indexOf(error.code) < 0) return false;
    this.setData({ legalBundle: null, legalAccepted: false, legalAllowed: false });
    if (error.code === "legal_version_changed") {
      await this.loadLegal();
      wx.showToast({ title: "协议已更新，请重新阅读并勾选同意", icon: "none" });
    } else {
      this.setData({ legalLoading: false, legalError: "协议内容正在更新，请稍后重新加载" });
    }
    return true;
  },
  openLegal(e) {
    const doc = e.currentTarget.dataset.doc;
    wx.navigateTo({ url: "/pages/legal/legal" + (doc ? "?doc=" + encodeURIComponent(doc) : "") });
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
    if (!this.checkLegal()) return;
    if (this.data.smsWait) return;
    const phone = String(this.data.phone || "").trim();
    if (!/^1\d{10}$/.test(phone)) {
      this.setData({ "errors.phone": phone ? "手机号不正确" : "请填写手机号" });
      return;
    }
    const scene = (e.currentTarget.dataset.scene === "register") ? "register" : "login";
    try {
      const res = await request("/auth/sms", "POST", { phone, scene, ...this.legalPayload() });
      this.setData({ smsNote: (res && res.message) || "验证码已发送", smsWait: 60, "errors.phone": "" });
      clearInterval(this._smsTimer);
      this._smsTimer = setInterval(() => {
        const left = this.data.smsWait - 1;
        this.setData({ smsWait: left > 0 ? left : 0 });
        if (left <= 0) clearInterval(this._smsTimer);
      }, 1000);
    } catch (err) {
      if (await this.handleLegalError(err)) return;
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
    if (!this.checkLegal()) return;
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
      await this.after(await request("/auth/login-sms", "POST", { phone, code: this.data.smsCode, ...this.legalPayload() }));
    } catch (e) {
      if (await this.handleLegalError(e)) return;
      wx.showModal({ title: "登录失败", content: (e && e.message) || "请稍后重试", showCancel: false });
    }
  },
  async pwdLogin() {
    if (!this.checkLegal()) return;
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
        ...this.legalPayload(),
      }));
    } catch (e) {
      if (await this.handleLegalError(e)) return;
      this.loadCaptcha();
      wx.showModal({ title: "登录失败", content: (e && e.message) || "请稍后重试", showCancel: false });
    }
  },
  async register() {
    if (!this.checkLegal()) return;
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
        ...this.legalPayload(),
      }));
    } catch (e) {
      if (await this.handleLegalError(e)) return;
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
    if (!this.checkLegal()) return;
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
        ...this.legalPayload(),
      }));
    } catch (err) {
      if (await this.handleLegalError(err)) return;
      wx.showModal({ title: "登录失败", content: (err && err.message) || "请稍后重试", showCancel: false });
    } finally {
      wx.hideLoading();
    }
  },
});
