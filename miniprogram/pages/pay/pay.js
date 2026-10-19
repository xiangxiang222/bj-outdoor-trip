const { request, setAuth } = require("../../utils/request");
const { invokeWechatPay, ensureWechatCode } = require("../../utils/pay");
const app = getApp();

function payLabel(data, amount, mode) {
  const n = Number(amount);
  if (!n) return "去支付";
  if (data && !data.isOwner && mode !== "split" && n === Number(data.remainAmount)) return "微信代付 ¥" + n;
  if (data && data.isOwner && mode === "self") return "微信支付 ¥" + n;
  return "微信支付 ¥" + n;
}

function walletState(amount) {
  const bal = Number((app.globalData.user && app.globalData.user.walletBalance) || 0);
  const n = Number(amount || 0);
  return { walletBalance: bal, walletCanCover: bal >= n && n > 0 };
}

Page({
  data: { token: "", data: null, amount: "", mode: "self", msg: "", err: "", payLabel: "去支付", walletBalance: 0, walletCanCover: false },
  onLoad(q) {
    this.setData({ token: q.token || "" });
  },
  onShow() {
    if (this.data.token) this.load();
  },
  async load() {
    if (!this.data.token) {
      this.setData({ err: "缺少付款链接" });
      return;
    }
    try {
      if (app.globalData.token) {
        const me = await request("/me");
        setAuth(app.globalData.token, me.data);
      }
      const res = await request("/pay/share/" + this.data.token);
      const data = res.data || {};
      const mode = this.data.mode || "self";
      const keepSplit = mode === "split" && this.data.amount;
      const amount = keepSplit ? this.data.amount : String(data.remainAmount || "");
      this.setData({
        data,
        mode,
        amount,
        err: "",
        payLabel: payLabel(data, amount, mode),
        ...walletState(amount),
      });
    } catch (e) {
      this.setData({ err: e.message || "付款链接不存在" });
    }
  },
  setMode(e) {
    const mode = e.currentTarget.dataset.mode;
    const remain = this.data.data && this.data.data.remainAmount;
    const amount = mode === "split" ? "" : String(remain || "");
    this.setData({ mode, amount, msg: "", payLabel: payLabel(this.data.data, amount, mode), ...walletState(amount) });
  },
  setAmount(e) {
    const amount = e.detail.value;
    this.setData({ amount, payLabel: payLabel(this.data.data, amount, this.data.mode), ...walletState(amount) });
  },
  pay() {
    return this.charge("");
  },
  payWallet() {
    return this.charge("wallet");
  },
  async charge(channel) {
    if (!app.globalData.token) {
      wx.navigateTo({
        url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/pay/pay?token=" + this.data.token),
      });
      return;
    }
    const amount = Number(this.data.amount);
    const remain = Number(this.data.data && this.data.data.remainAmount);
    if (!amount) {
      this.setData({ msg: "请填写支付金额" });
      return;
    }
    if (amount > remain) {
      this.setData({ msg: "不能超过待付金额" });
      return;
    }
    this.setData({ msg: "" });
    try {
      const payload = { token: this.data.token, amount, channel };
      if (channel !== "wallet") payload.code = await ensureWechatCode();
      const res = await request("/pay/for-enrollment", "POST", payload);
      await invokeWechatPay(res.data);
      if (res.data.user) setAuth(app.globalData.token, res.data.user);
      wx.showToast({ title: res.data.payStatus === "paid" ? "已付清" : "已支付", icon: "none" });
      this.setData({ mode: "self", amount: "" });
      this.load();
    } catch (e) {
      this.setData({ msg: e.message || "支付失败" });
    }
  },
  goTrip() {
    const id = this.data.data && this.data.data.scheduleId;
    if (id) wx.redirectTo({ url: "/pages/schedule/schedule?id=" + id });
  },
  onShareAppMessage() {
    const d = this.data.data || {};
    return {
      title: (d.travelerName || "同行") + "的团费还差 ¥" + (d.remainAmount || 0),
      path: "/pages/pay/pay?token=" + this.data.token,
    };
  },
});
