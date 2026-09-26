const { request } = require("../../utils/request");
const { parseIdCard } = require("../../utils/idcard");
const { invokeWechatPay } = require("../../utils/pay");
const app = getApp();
Page({
  data: {
    id: "",
    ref: "",
    coupon: "",
    s: null,
    idHint: "",
    idOk: false,
    isActivity: false,
    isFree: false,
    companions: [],
    companionMsg: "",
    form: { travelerName: "", travelerPhone: "", idCard: "", travelerType: "adult", joinMode: "chain", seatNo: "", insuranceCode: "outdoor", emergencyName: "", emergencyPhone: "", waiverAccepted: false, healthOk: false, wantGender: "any", wantSchool: "", comboNote: "", joinCode: "" },
    genderLabels: ["不限", "女生", "男生"],
    genderKeys: ["any", "female", "male"],
    genderIndex: 0,
    seatRows: [],
    plans: [],
    supplies: [],
    waiver: "",
    cancelSummary: "出发日前可取消；出发当天不可取消。",
    mergeTpl: "",
  },
  onLoad(q) {
    if (!app.globalData.token) {
      const back = "/pages/enroll/enroll?id=" + q.id
        + (q.ref ? "&ref=" + encodeURIComponent(q.ref) : "")
        + (q.coupon ? "&coupon=" + encodeURIComponent(q.coupon) : "")
        + (q.joinCode || q.code ? "&joinCode=" + encodeURIComponent(q.joinCode || q.code) : "");
      wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent(back) });
      return;
    }
    this.setData({
      id: q.id,
      ref: q.ref || "",
      coupon: q.coupon || "",
      "form.travelerName": (app.globalData.user || {}).nickname || "",
      "form.travelerPhone": (app.globalData.user || {}).phone || "",
      "form.joinMode": q.joinMode === "photographer" || q.joinMode === "assistant" ? q.joinMode : "chain",
      "form.joinCode": q.code || q.joinCode || "",
    });
    this.loadCompanions();
    request("/schedules/" + q.id).then((r) => {
      const s = r.data;
      const isActivity = s && s.channel === "activity";
      const qte = (s && s.quote) || {};
      const isFree = Number(qte.price || 0) === 0 && Number(qte.originPrice || 0) === 0;
      this.setData({
        s,
        isActivity,
        isFree,
        "form.insuranceCode": isActivity ? "none" : this.data.form.insuranceCode,
        cancelSummary: (s.refundPolicy && s.refundPolicy.summary) || this.data.cancelSummary,
      });
      wx.setNavigationBarTitle({ title: isActivity ? "报名本局" : "报名" });
      if (!isActivity) {
        request("/schedules/" + q.id + "/seats").then((seatRes) => {
          const seats = (seatRes.data && seatRes.data.seats) || [];
          const groups = [];
          seats.forEach((seat) => {
            const last = groups[groups.length - 1];
            if (!last || last.row !== seat.row) groups.push({ row: seat.row, seats: [seat] });
            else last.seats.push(seat);
          });
          this.setData({ seatRows: groups });
        }).catch(() => {});
      }
    });
    request("/meta").then((r) => {
      const data = (r && r.data) || {};
      this.setData({
        plans: data.insurance || [],
        supplies: (data.supplies || []).map((p) => Object.assign({}, p, { qty: 0 })),
        waiver: data.waiverText || "",
        cancelSummary: (this.data.s && this.data.s.refundPolicy && this.data.s.refundPolicy.summary) || (data.cancelPolicy && data.cancelPolicy.summary) || this.data.cancelSummary,
        mergeTpl: (data.subscribeTemplates && data.subscribeTemplates.merge) || "",
      });
    }).catch(() => {});
  },
  incSupply(e) {
    const code = e.currentTarget.dataset.code;
    const supplies = this.data.supplies.map((p) =>
      p.code === code ? Object.assign({}, p, { qty: Math.min(10, (p.qty || 0) + 1) }) : p
    );
    this.setData({ supplies });
  },
  decSupply(e) {
    const code = e.currentTarget.dataset.code;
    const supplies = this.data.supplies.map((p) =>
      p.code === code ? Object.assign({}, p, { qty: Math.max(0, (p.qty || 0) - 1) }) : p
    );
    this.setData({ supplies });
  },
  pickIns(e) {
    this.setData({ "form.insuranceCode": e.currentTarget.dataset.code });
  },
  pickSeat(e) {
    const no = e.currentTarget.dataset.no;
    const taken = e.currentTarget.dataset.taken;
    if (taken) return;
    this.setData({ "form.seatNo": this.data.form.seatNo === no ? "" : no });
  },
  loadCompanions() {
    request("/me/companions").then((r) => this.setData({ companions: r.data || [] })).catch(() => {});
  },
  applyCompanion(e) {
    const c = this.data.companions[e.currentTarget.dataset.index];
    if (!c) return;
    this.setData({
      "form.travelerName": c.name || "",
      "form.travelerPhone": c.phone || "",
      "form.emergencyName": c.emergencyName || "",
      "form.emergencyPhone": c.emergencyPhone || "",
      companionMsg: "已带入 " + (c.name || ""),
    });
  },
  saveCompanion() {
    const f = this.data.form;
    request("/me/companions", "POST", {
      name: f.travelerName,
      phone: f.travelerPhone,
      emergencyName: f.emergencyName,
      emergencyPhone: f.emergencyPhone,
    }).then((r) => {
      this.setData({ companions: r.data || [], companionMsg: "已存为常用报名人" });
    }).catch((err) => {
      this.setData({ companionMsg: (err && err.message) || "保存失败" });
    });
  },
  setName(e) { this.setData({ "form.travelerName": e.detail.value }); },
  setPhone(e) { this.setData({ "form.travelerPhone": e.detail.value }); },
  setJoinCode(e) { this.setData({ "form.joinCode": e.detail.value }); },
  setEmergencyName(e) { this.setData({ "form.emergencyName": e.detail.value }); },
  setEmergencyPhone(e) { this.setData({ "form.emergencyPhone": e.detail.value }); },
  toggleHealth() { this.setData({ "form.healthOk": !this.data.form.healthOk }); },
  toggleWaiver() { this.setData({ "form.waiverAccepted": !this.data.form.waiverAccepted }); },
  setWantGender(e) {
    const i = Number(e.detail.value);
    this.setData({ genderIndex: i, "form.wantGender": this.data.genderKeys[i] });
  },
  setWantSchool(e) { this.setData({ "form.wantSchool": e.detail.value }); },
  setComboNote(e) { this.setData({ "form.comboNote": e.detail.value }); },
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
  goStudent() {
    wx.navigateTo({ url: "/pages/student/student?redirect=" + encodeURIComponent("/pages/enroll/enroll?id=" + this.data.id) });
  },
  async submit() {
    if (this.data.s && this.data.s.status === "cancelled") {
      wx.showToast({ title: "该拼团已解散", icon: "none" });
      return;
    }
    if (this.data.s && this.data.s.eligibility && this.data.s.eligibility.enabled && !this.data.s.eligibility.canEnroll) {
      wx.showModal({ title: "暂不能报名", content: this.data.s.eligibility.reason || "请先完成校园认证", showCancel: false });
      return;
    }
    if (!this.data.form.travelerName || !this.data.form.travelerPhone) {
      wx.showToast({ title: "请填写姓名和手机", icon: "none" });
      return;
    }
    if (this.data.s && this.data.s.joinCodeRequired && !this.data.s.joinCode && !String(this.data.form.joinCode || "").trim()) {
      wx.showToast({ title: "请填写入团口令", icon: "none" });
      return;
    }
    if (this.data.isActivity) {
      if (!/^1\d{10}$/.test(String(this.data.form.travelerPhone))) {
        wx.showToast({ title: "手机号不正确", icon: "none" });
        return;
      }
    } else {
    const parsed = this.checkId();
    if (!parsed.valid) {
      wx.showModal({ title: "身份证号不正确", content: parsed.error, showCancel: false });
      return;
    }
    if (!this.data.form.emergencyName || !this.data.form.emergencyPhone) {
      wx.showToast({ title: "请填紧急联系人", icon: "none" });
      return;
    }
    if (this.data.form.emergencyPhone === this.data.form.travelerPhone) {
      wx.showToast({ title: "紧急联系人手机不能相同", icon: "none" });
      return;
    }
    if (!this.data.form.healthOk) {
      wx.showToast({ title: "请确认健康状况", icon: "none" });
      return;
    }
    if (!this.data.form.waiverAccepted) {
      wx.showToast({ title: "请确认风险告知", icon: "none" });
      return;
    }
    }
    try {
      const payload = this.data.isActivity
        ? {
            scheduleId: Number(this.data.id),
            travelerName: this.data.form.travelerName,
            travelerPhone: this.data.form.travelerPhone,
            joinCode: this.data.form.joinCode || (this.data.s && this.data.s.joinCode) || "",
          }
        : {
            scheduleId: Number(this.data.id),
            ...this.data.form,
            joinCode: this.data.form.joinCode || (this.data.s && this.data.s.joinCode) || "",
            idCard: this.checkId().idCard,
            referrerCode: this.data.ref,
            couponCode: this.data.coupon || undefined,
            supplies: (this.data.supplies || []).filter((p) => p.qty > 0).map((p) => ({ code: p.code, qty: p.qty })),
          };
      const res = await request("/enroll", "POST", payload);
      if (res.data.needPay) {
        if (res.data.wechatPay && res.data.wechatPay.mock) {
          await request("/pay/mock-success", "POST", { tradeNo: res.data.tradeNo, enrollmentId: res.data.enrollmentId });
        } else {
          await invokeWechatPay(res.data);
        }
      }
      wx.showToast({ title: res.data.waitlisted ? "已加入候补" : "报名成功" });
      const tpl = this.data.mergeTpl;
      const go = () => wx.redirectTo({ url: "/pages/schedule/schedule?id=" + this.data.id });
      if (tpl && wx.requestSubscribeMessage) {
        wx.requestSubscribeMessage({
          tmplIds: [tpl],
          complete: go,
        });
      } else {
        go();
      }
    } catch (e) {
      wx.showModal({ title: "报名失败", content: e.message, showCancel: false });
    }
  },
});
