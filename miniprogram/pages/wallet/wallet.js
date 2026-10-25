const { request, setAuth, showError } = require("../../utils/request");
const { invokeWechatPay, ensureWechatCode, requestMerchantTransfer } = require("../../utils/pay");
const app = getApp();

const FAQS = [
  {
    title: "使用规则",
    items: [
      { q: "余额怎么用", a: "余额用来支付团费。不用时可以提到本人微信零钱。" },
      { q: "能不能提到银行卡", a: "不能。只支持提到本人微信零钱，不绑银行卡。" },
    ],
  },
  {
    title: "提现问题",
    items: [
      { q: "提现要什么", a: "要先设置 6 位支付密码。不要求实名。提交后在微信里确认收款，确认后余额才扣。" },
      { q: "多久到账、有没有限额", a: "确认收款后实时到账，延迟最迟 24 小时。不限次数，单笔最多 2000 元，超出可马上再提一笔。" },
    ],
  },
  {
    title: "充值问题",
    items: [{ q: "怎么充值", a: "使用微信支付。单笔 1～5000 元，须为整数元，支付成功后立即进入余额。" }],
  },
];

function monthGroups(rows) {
  const map = {};
  const order = [];
  (rows || []).forEach((item) => {
    const key = String(item.createdAt || "").slice(0, 7) || "更早";
    if (!map[key]) {
      map[key] = [];
      order.push(key);
    }
    map[key].push(item);
  });
  return order.map((key) => ({
    key,
    label: /^\d{4}-\d{2}$/.test(key) ? key.slice(0, 4) + "年" + Number(key.slice(5)) + "月" : key,
    items: map[key],
  }));
}

Page({
  data: {
    data: { bills: [], balance: 0, withdrawals: [] },
    shownBills: [],
    showAllBills: false,
    mode: "",
    topupAmount: "100",
    withdrawAmount: "",
    pin: "",
    pinOpen: false,
    quick: [50, 100, 200, 500],
    keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((label, id) => ({ id, label })),
    rule: { available: 0 },
    msg: "",
    faqs: FAQS,
    openFaq: "",
    recordTab: "success",
    recordGroups: [],
    receipt: { title: "", hint: "", amount: 0, method: "" },
    walletReady: false,
  },
  onShow() {
    if (this.data.mode === "done") return;
    this.load();
  },
  billsOf(data, all) {
    const bills = (data && data.bills) || [];
    return all ? bills : bills.slice(0, 6);
  },
  groupsOf(data, tab) {
    return monthGroups(((data && data.withdrawals) || []).filter((item) => item.status === tab));
  },
  async load() {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/wallet/wallet") });
      return;
    }
    try {
      const res = await request("/me/wallet");
      const data = res.data || { bills: [], withdrawals: [] };
      const rule = data.withdrawRule || {};
      const balance = Number(data.balance || 0);
      const available = rule.available != null ? Number(rule.available) : Math.min(balance, 2000);
      this.setData({
        data,
        rule: { available },
        shownBills: this.billsOf(data, this.data.showAllBills),
        recordGroups: this.groupsOf(data, this.data.recordTab),
        msg: "",
        walletReady: true,
      });
    } catch (e) {
      this.setData({ msg: e.message || "加载失败", walletReady: true });
    }
  },
  title(text) {
    wx.setNavigationBarTitle({ title: text });
  },
  backHome() {
    this.setData({ mode: "", msg: "", pinOpen: false });
    this.title("我的钱包");
  },
  openTopup() {
    this.setData({ mode: "topup", msg: "" });
    this.title("余额充值");
  },
  openWithdraw() {
    const available = Number(this.data.rule.available || 0);
    this.setData({
      mode: "withdraw",
      msg: "",
      withdrawAmount: available > 0 ? String(available) : this.data.withdrawAmount,
    });
    this.title("余额提现");
  },
  openRecords() {
    this.setData({
      mode: "records",
      recordGroups: this.groupsOf(this.data.data, this.data.recordTab),
    });
    this.title("提现记录");
  },
  setRecord(e) {
    const recordTab = e.currentTarget.dataset.tab;
    this.setData({ recordTab, recordGroups: this.groupsOf(this.data.data, recordTab) });
  },
  showBills() {
    this.setData({ showAllBills: true, shownBills: this.billsOf(this.data.data, true) });
  },
  toggleFaq(e) {
    const q = e.currentTarget.dataset.q;
    this.setData({ openFaq: this.data.openFaq === q ? "" : q });
  },
  fillAll() {
    const available = Number(this.data.rule.available || 0);
    if (available > 0) this.setData({ withdrawAmount: String(available) });
  },
  setTopup(e) {
    this.setData({ topupAmount: e.detail.value });
  },
  pickTopup(e) {
    this.setData({ topupAmount: String(e.currentTarget.dataset.n) });
  },
  setWithdraw(e) {
    this.setData({ withdrawAmount: e.detail.value });
  },
  askPin() {
    if (!this.data.data.pinSet) {
      wx.navigateTo({ url: "/pages/wallet-pin/wallet-pin" });
      return;
    }
    this.setData({ pin: "", pinOpen: true, msg: "" });
  },
  closePin() {
    this.setData({ pinOpen: false, pin: "" });
  },
  noop() {},
  pressKey(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    let pin = this.data.pin;
    if (key === "⌫") pin = pin.slice(0, -1);
    else if (pin.length < 6) pin += key;
    this.setData({ pin });
    if (pin.length === 6) this.withdraw();
  },
  async topup() {
    try {
      const code = await ensureWechatCode();
      const res = await request("/me/wallet/topup", "POST", { amount: Number(this.data.topupAmount), code });
      await invokeWechatPay(res.data);
      if (res.data.user) setAuth(app.globalData.token, res.data.user);
      this.setData({
        mode: "done",
        receipt: {
          title: "充值成功",
          hint: "余额已更新，可以用来付团费。",
          amount: res.data.amount || this.data.topupAmount,
          method: "微信支付",
        },
      });
      this.title("充值成功");
      this.load();
    } catch (e) {
      showError("充值失败", e);
    }
  },
  async withdraw() {
    try {
      const res = await request("/me/wallet/withdraw", "POST", {
        amount: Number(this.data.withdrawAmount),
        pin: this.data.pin,
      });
      let title = "提现成功";
      let hint = "已转到微信零钱。";
      if (res.data.needConfirm && res.data.packageInfo) {
        await requestMerchantTransfer(res.data);
        const done = await request("/me/wallet/withdraw/confirm", "POST", { outBillNo: res.data.outBillNo });
        if (done.data.user) setAuth(app.globalData.token, done.data.user);
        if (done.data.pending) {
          title = "提现已提交";
          hint = "微信正在入账，可在提现记录里查看。";
        }
      } else if (res.data.user) {
        setAuth(app.globalData.token, res.data.user);
      }
      this.setData({
        mode: "done",
        pin: "",
        pinOpen: false,
        receipt: { title, hint, amount: res.data.amount, method: "微信零钱" },
      });
      this.title(title);
      this.load();
    } catch (e) {
      this.setData({ pin: "" });
      showError("提现失败", e);
    }
  },
  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  },
});
