const { request } = require("../../utils/request");
const { parseIdCard } = require("../../utils/idcard");
const app = getApp();
Page({
  data: {
    id: "",
    s: null,
    idHint: "",
    idOk: false,
    form: { travelerName: "", travelerPhone: "", idCard: "", travelerType: "adult" },
  },
  onLoad(q) {
    if (!app.globalData.token) {
      wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/enroll/enroll?id=" + q.id) });
      return;
    }
    this.setData({
      id: q.id,
      "form.travelerName": (app.globalData.user || {}).nickname || "",
      "form.travelerPhone": (app.globalData.user || {}).phone || "",
    });
    request("/schedules/" + q.id).then((r) => this.setData({ s: r.data }));
  },
  setName(e) { this.setData({ "form.travelerName": e.detail.value }); },
  setPhone(e) { this.setData({ "form.travelerPhone": e.detail.value }); },
  setId(e) {
    this.setData({ "form.idCard": e.detail.value });
    this.checkId(e.detail.value);
  },
  checkId(value) {
    const parsed = parseIdCard(value == null ? this.data.form.idCard : value);
    if (!(value == null ? this.data.form.idCard : value)) {
      this.setData({ idHint: "", idOk: false });
      return parsed;
    }
    if (!parsed.valid) {
      this.setData({ idHint: parsed.error, idOk: false });
      return parsed;
    }
    this.setData({
      "form.idCard": parsed.idCard,
      idHint: (parsed.gender === "female" ? "女" : "男") + " · " + parsed.birthday,
      idOk: true,
    });
    return parsed;
  },
  async submit() {
    if (this.data.s && this.data.s.status === "cancelled") {
      wx.showToast({ title: "该拼团已解散", icon: "none" });
      return;
    }
    if (!this.data.form.travelerName || !this.data.form.travelerPhone) {
      wx.showToast({ title: "请填写姓名和手机", icon: "none" });
      return;
    }
    const parsed = this.checkId();
    if (!parsed.valid) {
      wx.showModal({ title: "身份证号不正确", content: parsed.error, showCancel: false });
      return;
    }
    try {
      const res = await request("/enroll", "POST", {
        scheduleId: Number(this.data.id),
        ...this.data.form,
        idCard: parsed.idCard,
      });
      if (res.data.needPay) {
        const pay = res.data.wechatPay;
        if (pay.mock) {
          await request("/pay/mock-success", "POST", { tradeNo: res.data.tradeNo, enrollmentId: res.data.enrollmentId });
        } else {
          await wx.requestPayment(pay);
        }
      }
      wx.showToast({ title: "报名成功" });
      wx.redirectTo({ url: "/pages/schedule/schedule?id=" + this.data.id });
    } catch (e) {
      wx.showModal({ title: "报名失败", content: e.message, showCancel: false });
    }
  },
});
