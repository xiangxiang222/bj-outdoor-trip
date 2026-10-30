const { request, setAuth } = require("../../utils/request");
const { invokeWechatPay, ensureWechatCode } = require("../../utils/pay");
const { isDark } = require("../../utils/appearance");
const app = getApp();

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.max(0, n)) : "0";
}
function walletState(amount) {
  const balance = Number((app.globalData.user && app.globalData.user.walletBalance) || 0);
  const n = Number(amount);
  return { walletBalance: balance, walletCanCover: Number.isInteger(n) && n > 0 && balance >= n };
}
function statusCopy(data) {
  if (data.payStatus === "refunded") return { statusTitle:"已退款", statusNote:"退款结果请在原订单中查看。", amountLabel:"订单团费" };
  if (data.cancelled) return { statusTitle:"报名已取消", statusNote:"该报名已取消或拼团已解散，请在订单中查看退款进度。", amountLabel:"订单团费" };
  if (["applied", "waitlist"].includes(data.enrollmentStatus)) return { statusTitle:data.enrollmentStatus === "applied" ? "等待抽签确认" : "正在候补", statusNote:"确认获得名额后，再支付这笔团费。", amountLabel:"订单团费" };
  if (data.company) return { statusTitle:"企业统一支付", statusNote:"公司团由开团方统一支付，无需个人付款。", amountLabel:"本次无需付款" };
  if (data.payStatus === "paid") return { statusTitle:"团费已付清", statusNote:"支付已完成，出发安排请查看行程。", amountLabel:"已支付" };
  return { statusTitle:data.isOwner ? "等待支付团费" : "受邀帮付团费", statusNote:data.isOwner ? "自己支付，也可以邀请朋友代付或分摊。" : "这笔付款仅用于当前报名的团费。", amountLabel:"还需支付" };
}
function recordLabel(row) {
  const remark = String(row.remark || "");
  if (remark.indexOf("分摊") >= 0) return "分摊团费";
  if (remark.indexOf("代付") >= 0) return "朋友代付";
  return "团费支付";
}
function viewState(data) {
  const total = Math.max(0, Number(data.payAmount) || 0);
  const paid = Math.max(0, Number(data.paidAmount) || 0);
  const records = (Array.isArray(data.contributors) ? data.contributors : Array.isArray(data.helpers) ? data.helpers : []).map((row) => ({ ...row, label:recordLabel(row), value:money(row.amount) }));
  return { ...statusCopy(data), total:money(total), collected:money(paid), remaining:money(data.remainAmount), progress:total > 0 ? Math.min(100, Math.round((data.payStatus === "paid" ? total : paid) / total * 100)) : 0, records };
}

Page({
  data: { token:"", data:null, ready:false, refreshing:false, paying:false, dark:false, amount:"", mode:"self", channel:"wechat", msg:"", ok:false, err:"", payLabel:"确认支付", chargeAmount:"", walletBalance:0, walletCanCover:false, total:"0", collected:"0", remaining:"0", records:[], progress:0, paymentPending:false },
  onLoad(q) {
    this._unloaded = false;
    this._seq = 0;
    this._accountToken = app.globalData.token;
    this.setData({ token:q.token || "", mode:q.mode === "split" ? "split" : "self" });
  },
  onShow() {
    this.setData({ dark:isDark() });
    if (this.data.paying) return;
    if (this._accountToken !== app.globalData.token) {
      this._accountToken = app.globalData.token;
      this._seq++;
      this._pendingPayment = null;
      this.setData({ data:null,ready:false,refreshing:false,mode:this.data.mode === "split" ? "split" : "self",amount:"",channel:"wechat",msg:"",ok:false,err:"",paymentPending:false });
    }
    return this.load();
  },
  onUnload() { this._unloaded = true; this._seq++; },
  live(context) { return !this._unloaded && context.token === app.globalData.token && context.share === this.data.token; },
  updatePayment(patch = {}) {
    const mode = patch.mode || this.data.mode;
    const amount = Object.prototype.hasOwnProperty.call(patch,"amount") ? patch.amount : this.data.amount;
    const channel = patch.channel || this.data.channel;
    const state = walletState(amount);
    const selected = channel === "wallet" && !state.walletCanCover ? "wechat" : channel;
    const n = Number(amount);
    const valid = Number.isInteger(n) && n > 0;
    const payLabel = mode === "proxy" ? "发给朋友代付" : valid ? selected === "wallet" ? "余额支付" : this.data.data && !this.data.data.isOwner && mode === "self" ? "微信代付" : "微信支付" : "确认支付";
    this.setData({ ...patch, channel:selected, ...state, payLabel, chargeAmount:valid ? money(n) : "" });
  },
  async load(options = {}) {
    if (this.data.refreshing) return null;
    const context = { token:app.globalData.token, share:this.data.token, seq:++this._seq };
    if (!context.share) { this.setData({ ready:true, err:"缺少付款链接" }); return null; }
    this.setData({ refreshing:true, err:"" });
    try {
      if (context.token) {
        try {
          const me = await request("/me");
          if (!this.live(context) || context.seq !== this._seq) return null;
          setAuth(context.token, me.data);
        } catch (_) { /* A public payment link remains available if profile refresh fails. */ }
      }
      if (!this.live(context) || context.seq !== this._seq) return null;
      const res = await request("/pay/share/" + context.share);
      if (!this.live(context) || context.seq !== this._seq) return null;
      const data = res.data || {};
      const mode = !data.isOwner && this.data.mode === "proxy" ? "self" : this.data.mode;
      const keep = mode === "split" && this.data.amount !== "";
      let amount = mode === "split" ? keep ? this.data.amount : "" : money(data.remainAmount);
      const pending = this._pendingPayment;
      const paid = data.payStatus === "paid";
      const advanced = pending && Number(data.paidAmount) >= pending.oldPaid + pending.amount;
      const terminal = data.cancelled || data.payStatus === "refunded" || !data.canPay;
      const resolved = pending && (paid || advanced || terminal);
      if (resolved) this._pendingPayment = null;
      if (resolved && (paid || advanced) && mode === "split") amount = "";
      const feedback = resolved ? { msg:paid ? "团费已付清，出发安排请查看行程" : advanced ? "本次付款已到账，可邀请朋友支付剩余团费" : "支付结果已更新，请在订单中查看", ok:!!(paid || advanced) } : pending ? {} : options.keepMessage ? {} : { msg:"",ok:false };
      this.setData({ data, ready:true, paymentPending:!!pending && !resolved, ...viewState(data), ...feedback });
      this.updatePayment({ mode, amount });
      return data;
    } catch (e) {
      if (this.live(context) && context.seq === this._seq) this.setData({ ready:true, err:e.message || "付款链接暂时无法打开，请重试" });
      return null;
    } finally {
      if (!this._unloaded && context.seq === this._seq) {
        this.setData({ refreshing:false });
        if (context.token !== app.globalData.token) {
          this._accountToken = app.globalData.token;
          this._pendingPayment = null;
          this.setData({ data:null,ready:true,mode:this.data.mode === "split" ? "split" : "self",amount:"",channel:"wechat",msg:"",ok:false,err:"登录状态已变化，请重新加载付款页面",paymentPending:false });
        }
      }
    }
  },
  async retry() {
    if (this.data.paying || this.data.refreshing || this._retrying) return;
    const context = { token:app.globalData.token,share:this.data.token,seq:++this._seq };
    const pending = this._pendingPayment;
    this._retrying = true;
    try {
      if (pending && pending.tradeNo) {
        this.setData({ refreshing:true });
        try {
          const confirmed = await request("/pay/confirm","POST",{ tradeNo:pending.tradeNo });
          if (!this.live(context) || context.seq !== this._seq) return;
          if (confirmed.data && confirmed.data.user) setAuth(context.token,confirmed.data.user);
        } catch (_) {
          // The shared ledger can still confirm a payment received by notification.
          if (!this.live(context) || context.seq !== this._seq) return;
        } finally {
          if (!this._unloaded && context.seq === this._seq) this.setData({ refreshing:false });
        }
      }
      if (this.live(context) && context.seq === this._seq) return await this.load({ keepMessage:true });
    } finally {
      this._retrying = false;
      if (!this._unloaded && context.seq === this._seq && !this.live(context)) {
        this._accountToken = app.globalData.token;
        this._pendingPayment = null;
        this.setData({ data:null,ready:true,refreshing:false,mode:"self",amount:"",channel:"wechat",msg:"",ok:false,err:"登录状态已变化，请重新加载付款页面",paymentPending:false });
      }
    }
  },
  setMode(e) {
    if (this.data.paying || this.data.refreshing || this.data.paymentPending || !this.data.data || !this.data.data.canPay) return;
    const mode = e.currentTarget.dataset.mode;
    if (!["self","proxy","split"].includes(mode) || mode === "proxy" && !this.data.data.isOwner) return;
    this.updatePayment({ mode, amount:mode === "split" ? "" : money(this.data.data.remainAmount), msg:"",ok:false });
  },
  setAmount(e) {
    if (this.data.paying || this.data.refreshing || this.data.paymentPending) return;
    this.updatePayment({ amount:e.detail.value, msg:"",ok:false });
  },
  quickAmount(e) {
    if (this.data.paying || this.data.refreshing || this.data.paymentPending || !this.data.data) return;
    const remain = Math.max(0, Number(this.data.data.remainAmount) || 0);
    this.updatePayment({ amount:String(e.currentTarget.dataset.kind === "half" ? Math.max(1, Math.ceil(remain / 2)) : remain), msg:"",ok:false });
  },
  setChannel(e) {
    if (this.data.paying || this.data.refreshing || this.data.paymentPending) return;
    const channel = e.currentTarget.dataset.channel;
    if (channel === "wallet" && !this.data.walletCanCover) return;
    if (["wallet","wechat"].includes(channel)) this.updatePayment({ channel, msg:"",ok:false });
  },
  pay() { return this.charge(this.data.channel); },
  payWallet() { return this.charge("wallet"); },
  async charge(channel) {
    if (this.data.paying || this.data.refreshing || this.data.paymentPending || this.data.err || !this.data.data || !this.data.data.canPay || this.data.mode === "proxy") return;
    if (!app.globalData.token) {
      wx.navigateTo({ url:"/pages/login/login?redirect=" + encodeURIComponent("/pages/pay/pay?token=" + this.data.token + (this.data.mode === "split" ? "&mode=split" : "")) });
      return;
    }
    const amount = Number(this.data.amount);
    const remain = Number(this.data.data.remainAmount);
    if (this.data.amount === "" || !Number.isFinite(amount) || amount <= 0) { this.setData({ msg:"请填写大于 0 的支付金额",ok:false }); return; }
    if (!Number.isInteger(amount)) { this.setData({ msg:"支付金额须为整数元",ok:false }); return; }
    if (amount > remain) { this.setData({ msg:"不能超过待付金额",ok:false }); return; }
    if (channel === "wallet" && !walletState(amount).walletCanCover) { this.setData({ msg:"余额不足，请选择微信支付",ok:false }); return; }
    const context = { token:app.globalData.token, share:this.data.token };
    const oldPaid = Number(this.data.data.paidAmount) || 0;
    const mode = this.data.mode;
    let submitted = false;
    this._seq++;
    this.setData({ paying:true, msg:"",ok:false, paymentPending:false });
    try {
      const payload = { token:context.share, amount, channel:channel === "wallet" ? "wallet" : "wechat" };
      if (payload.channel !== "wallet") payload.code = await ensureWechatCode();
      if (!this.live(context)) return;
      submitted = true;
      const response = await request("/pay/for-enrollment","POST",payload);
      if (!this.live(context)) return;
      const result = await invokeWechatPay(response.data);
      if (!this.live(context)) return;
      if (result && result.user) setAuth(context.token,result.user);
      this.setData({ mode, amount:mode === "split" ? "" : this.data.amount });
      const fresh = await this.load({ keepMessage:true });
      if (!this.live(context)) return;
      if (fresh && (fresh.cancelled || fresh.payStatus === "refunded")) {
        this.setData({ msg:"支付结果已更新，请在订单中查看",ok:false });
      } else if (fresh && fresh.payStatus === "paid") {
        this.setData({ msg:"团费已付清，出发安排请查看行程",ok:true,paymentPending:false });
        wx.showToast({ title:"团费已付清",icon:"none" });
      } else if (fresh && Number(fresh.paidAmount) >= oldPaid + amount) {
        this.setData({ msg:"本次付款已到账，可邀请朋友支付剩余团费",ok:true,paymentPending:false });
        wx.showToast({ title:"本次付款已到账",icon:"none" });
      } else {
        this._pendingPayment = { oldPaid,amount,tradeNo:response.data && response.data.tradeNo || "" };
        this.setData({ msg:"支付结果正在确认，请刷新查看，暂勿重复付款",ok:false,paymentPending:true });
      }
    } catch (e) {
      if (this.live(context)) {
        if (e.paymentPending) {
          this._pendingPayment = { oldPaid,amount,tradeNo:e.tradeNo || "" };
          this.setData({ msg:"支付结果正在确认，请刷新查看，暂勿重复付款",ok:false,paymentPending:true });
        } else if (submitted && e.networkError) {
          this._pendingPayment = { oldPaid,amount };
          this.setData({ msg:"支付结果正在确认，请刷新查看，暂勿重复付款",ok:false,paymentPending:true });
          await this.load({ keepMessage:true });
        } else this.setData({ msg:e.message || "支付未完成，请重试",ok:false });
      }
    } finally {
      if (!this._unloaded) {
        this.setData({ paying:false });
        if (!this.live(context)) { this._accountToken = app.globalData.token; this._pendingPayment = null; this.setData({ data:null,ready:false,mode:"self",amount:"",channel:"wechat",msg:"",ok:false,paymentPending:false }); this.load(); }
      }
    }
  },
  goTrip() {
    const id = this.data.data && this.data.data.scheduleId;
    if (id) wx.redirectTo({ url:"/pages/schedule/schedule?id=" + id });
  },
  onShareAppMessage() {
    const data = this.data.data || {};
    const split = this.data.mode === "split";
    return { title:(data.travelerName || "同行") + (split ? "邀请你分摊团费，还差 ¥" : "邀请你帮付团费，还差 ¥") + money(data.remainAmount), path:"/pages/pay/pay?token=" + this.data.token + (split ? "&mode=split" : "") };
  },
});
