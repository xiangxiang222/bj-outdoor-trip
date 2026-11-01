const { request, showError } = require("../../utils/request");
const { isReviewTrip } = require("../../utils/trips");
const { orderBadge, orderHint, orderMoney, orderShop, orderSpec, orderIcon, canReorder, priceLines, payMethodLabel, placedLabel, orderNo, maskTravelerPhone } = require("../../utils/order-view");
const { detailUrl } = require("../../utils/media");
const { isDark } = require("../../utils/appearance");
const app = getApp();

Page({
  data: {
    id: "",
    dark: false,
    activity: false,
    icon: "trip",
    stateKey: "",
    amountText: "",
    amountLabel: "",
    date: "",
    cancelling: false,
    submitting: false,
    order: null,
    err: "",
    badge: "",
    hint: "",
    shop: "",
    spec: "",
    money: "",
    phone: "",
    place: "",
    placed: "",
    orderNo: "",
    payMethod: "",
    lines: [],
    helpers: "",
    canReview: false,
    again: false,
    reviewOpen: false,
    rating: 5,
    content: "",
  },
  onLoad(q) {
    this._account = app.globalData.token;
    this.setData({ id: q.id || "", reviewOpen: q.review === "1" });
  },
  onUnload() { this._unloaded = true; },
  onShow() {
    this._unloaded = false;
    this.setData({dark:isDark()});
    if (this._account !== app.globalData.token) {
      this._account = app.globalData.token;
      this._requestVersion = (this._requestVersion || 0) + 1;
      this.clearOrder();
    }
    if (!app.globalData.token) {
      wx.navigateTo({
        url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/enroll-order/enroll-order?id=" + this.data.id),
      });
      return;
    }
    return this.load();
  },
  clearOrder() {
    this.setData({order:null,err:"",reviewOpen:false,content:"",rating:5,canReview:false,again:false,phone:"",place:"",placed:"",orderNo:"",payMethod:"",lines:[],helpers:"",cancelling:false,submitting:false});
  },
  async load() {
    if (!this.data.id) {
      this.setData({ err: "缺少订单号" });
      return;
    }
    const id = this.data.id;
    const token = app.globalData.token;
    const version = this._requestVersion = (this._requestVersion || 0) + 1;
    const active = () => !this._unloaded && token === app.globalData.token && id === this.data.id && version === this._requestVersion;
    try {
      const res = await request("/orders/" + id);
      if (!active()) return;
      const order = res.data || null;
      if (!order || !order.id) throw new Error("订单打不开");
      const canReview = isReviewTrip(order);
      const names = ((order && order.helpers) || []).map((row) => row.nickname).filter(Boolean).join("、");
      this.setData({
        order,
        activity:order.channel === "activity" || order.kind === "activity",
        icon:orderIcon(order),
        stateKey:orderBadge(order).key,
        amountLabel:order.canPay ? "剩余待付" : orderBadge(order).key === "refund" ? "订单金额" : "费用合计",
        amountText:(() => { const amount = Number(order.canPay ? order.remainAmount != null ? order.remainAmount : order.payAmount != null ? order.payAmount : order.pay_amount || 0 : order.payAmount != null ? order.payAmount : order.pay_amount || 0); return amount > 0 ? "¥" + amount : "免费"; })(),
        date:[order.start_date || order.startDate || "",order.meetup_time || order.meetupTime || ""].filter(Boolean).join(" "),
        err: "",
        badge: orderBadge(order).label,
        hint: orderHint(order),
        shop: orderShop(order),
        spec: orderSpec(order),
        money: orderMoney(order),
        phone: maskTravelerPhone(order && order.traveler_phone),
        place: (order && (order.meetup_point || order.city)) || orderSpec(order),
        placed: placedLabel(order),
        orderNo: orderNo(order),
        payMethod: payMethodLabel(order),
        lines: priceLines(order).lines,
        helpers: names,
        canReview,
        again: canReorder(order),
        reviewOpen: this.data.reviewOpen && canReview,
      });
    } catch (e) {
      if (!active()) return;
      this.setData({ order: null, err: e.message || "订单打不开" });
    }
  },
  coverError() { this.setData({"order.cover":""}); },
  copyNo() {
    wx.setClipboardData({ data: this.data.orderNo || "" });
  },
  goSchedule() {
    const sid = this.data.order && this.data.order.schedule_id;
    if (sid) wx.navigateTo({ url: "/pages/schedule/schedule?id=" + sid });
  },
  goPay() {
    const token = this.data.order && this.data.order.payShareToken;
    if (!token) return;
    wx.navigateTo({ url: "/pages/pay/pay?token=" + token });
  },
  goWish() {
    if (!this.data.order) return;
    if (this.data.order.wishToken) {
      wx.navigateTo({ url:"/pages/wishes/wishes?token=" + encodeURIComponent(this.data.order.wishToken) });
      return;
    }
    if (!this.data.order.canLinkWish) return;
    wx.navigateTo({ url:"/pages/wishes/wishes?view=new&kind=trip&enrollmentId=" + encodeURIComponent(this.data.id) });
  },
  openReview() {
    this.setData({ reviewOpen: true, rating: 5, content: "" });
  },
  pickStar(e) {
    this.setData({ rating: Number(e.currentTarget.dataset.n) });
  },
  setContent(e) {
    this.setData({ content: e.detail.value });
  },
  async submitReview() {
    if (this.data.submitting || !this.data.canReview) return;
    this.setData({submitting:true});
    try {
      await request("/reviews", "POST", {
        scheduleId: this.data.order.schedule_id,
        rating: this.data.rating,
        content: this.data.content,
      });
      wx.showToast({ title: "评价已提交", icon: "none" });
      this.setData({ reviewOpen: false });
      this.load();
    } catch (err) {
      showError("评价失败", err);
    } finally { this.setData({submitting:false}); }
  },
  goAfter() {
    const sid = this.data.order && this.data.order.schedule_id;
    if (sid) wx.navigateTo({ url: "/pages/after/after?id=" + sid });
  },
  goRoute() {
    const id = this.data.order && this.data.order.route_id;
    if (id && canReorder(this.data.order)) wx.navigateTo({ url: detailUrl(id) });
  },
  cancel() {
    const item = this.data.order;
    if (!item || !item.canCancel || this.data.cancelling) return;
    const deduct = Number(item.deductAmount) || 0;
    const content = deduct
      ? "临近出发，取消将扣除 " + item.deductPercent + "%（¥" + deduct + "），退回 ¥" + (Number(item.refundAmount) || 0) + "。确定取消报名？名额将释放给其他人。"
      : item.refundHint
        ? "确定取消报名？" + item.refundHint + "。名额将释放给其他人。已付款按付款人原路退回。"
        : "确定取消报名？名额将释放给其他人。已付款按付款人原路退回。";
    wx.showModal({
      title: deduct ? "取消将扣费" : "取消报名",
      content,
      confirmColor: "#5b3b8c",
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({cancelling:true});
        try {
          await request("/orders/" + item.id + "/cancel", "POST");
          wx.showToast({ title: "已取消报名", icon: "none" });
          this.load();
        } catch (err) {
          showError("取消失败", err);
        } finally { this.setData({cancelling:false}); }
      },
    });
  },
});
