const { request, showError } = require("../../utils/request");
const { showAfterActions, todayYmd } = require("../../utils/trips");
const { orderBadge, orderHint, orderMoney, orderShop, orderSpec, canReorder, priceLines, payMethodLabel, placedLabel, orderNo, maskTravelerPhone } = require("../../utils/order-view");
const { detailUrl } = require("../../utils/media");
const app = getApp();

Page({
  data: {
    id: "",
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
    this.setData({ id: q.id || "", reviewOpen: q.review === "1" });
  },
  onShow() {
    if (!app.globalData.token) {
      wx.navigateTo({
        url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/enroll-order/enroll-order?id=" + this.data.id),
      });
      return;
    }
    this.load();
  },
  async load() {
    if (!this.data.id) {
      this.setData({ err: "缺少订单号" });
      return;
    }
    try {
      const res = await request("/orders/" + this.data.id);
      const order = res.data || null;
      const canReview = Boolean(order && showAfterActions(order) && order.canReview && String(order.start_date || "").slice(0, 10) < todayYmd());
      const names = ((order && order.helpers) || []).map((row) => row.nickname).filter(Boolean).join("、");
      this.setData({
        order,
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
      this.setData({ order: null, err: e.message || "订单打不开" });
    }
  },
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
    }
  },
  goAfter() {
    const sid = this.data.order && this.data.order.schedule_id;
    if (sid) wx.navigateTo({ url: "/pages/after/after?id=" + sid });
  },
  goRoute() {
    const id = this.data.order && this.data.order.route_id;
    if (id) wx.navigateTo({ url: detailUrl(id) });
  },
  cancel() {
    const item = this.data.order;
    if (!item) return;
    const deduct = Number(item.deductAmount) || 0;
    const content = deduct
      ? "临近出发，取消将扣除 " + item.deductPercent + "%（¥" + deduct + "），退回 ¥" + (Number(item.refundAmount) || 0) + "。确定取消报名？名额将释放给其他人。"
      : item.refundHint
        ? "确定取消报名？" + item.refundHint + "。名额将释放给其他人。已付款按付款人原路退回。"
        : "确定取消报名？名额将释放给其他人。已付款按付款人原路退回。";
    wx.showModal({
      title: deduct ? "取消将扣费" : "取消报名",
      content,
      confirmColor: "#bc4749",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await request("/orders/" + item.id + "/cancel", "POST");
          wx.showToast({ title: "已取消报名", icon: "none" });
          this.load();
        } catch (err) {
          showError("取消失败", err);
        }
      },
    });
  },
});
