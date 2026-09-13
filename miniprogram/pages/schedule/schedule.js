const { request } = require("../../utils/request");
const { invokeWechatPay, ensureWechatCode } = require("../../utils/pay");
const { payStatusText, starText } = require("../../utils/labels");
const { shareCover } = require("../../utils/media");
const { drawWeatherChart } = require("../../utils/weather-chart");
const { dateOf } = require("../../utils/activity-kind");
const { peopleLine, trustChips, dockPrice, enrollCta, canShowEnroll, ticketState } = require("../../utils/scan-facts");
const app = getApp();

function busLine(s) {
  const b = s && s.bus;
  if (!b) return "车型待确认";
  const bits = [b.name];
  if (b.seats) bits.push(b.seats + " 座");
  bits.push(b.plateNo ? b.plateNo : "车号待确认");
  return bits.join(" · ");
}

Page({
  data: {
    s: null,
    id: "",
    coupon: "",
    tab: "trip",
    routeDetail: {},
    routeAlbum: [],
    routeReviews: { list: [], count: 0, avg: 0 },
    faqs: [],
    cancelItems: [],
    commonRules: { title: "", summary: "", sections: [] },
    waiverText: "",
    showDissolve: false,
    reason: "",
    seatRows: [],
    weather: null,
    reviews: { list: [], count: 0, avg: 0 },
    packing: [],
    cancelSummary: "",
    refundHint: "",
    contacts: { officialWechat: "同行者众", officialWechatName: "同行者众官方", officialGroup: "同行者众户外交流群" },
    gallery: [],
    busPhotos: [],
    busText: "",
    isActivity: false,
    isFree: false,
    remainSeats: 0,
    whenLabel: "",
    whenText: "",
    peopleText: "",
    trusts: [],
    ticket: null,
    priceDock: { free: true, main: "免费", sub: "" },
    showEnroll: false,
    ctaText: "立即报名",
    statusTag: "",
    posted: "",
    joinedHint: "",
    leaderSlots: [{ slot: 1, label: "领队1", leader: null }, { slot: 2, label: "领队2", leader: null }],
  },
  onLoad(q) {
    const tab = ["trip", "route", "rules"].includes(q.tab) ? q.tab : "trip";
    this.setData({ id: q.id, coupon: q.coupon || "", posted: q.posted || "", joinedHint: q.joined || "", tab });
    wx.showShareMenu({ withShareTicket: true, menus: ["shareAppMessage", "shareTimeline"] });
  },
  onShow() { this.load(); },
  load() {
    request("/schedules/" + this.data.id).then((r) => {
      const s = r.data;
      if (s && s.chain) {
        s.chain = s.chain.map((c) => Object.assign({}, c, { payText: payStatusText(c.payStatus) }));
      }
      const isActivity = s.channel === "activity";
      const q = s.quote || {};
      const isFree = Number(q.price || 0) === 0 && Number(q.originPrice || 0) === 0;
      const remainSeats = Math.max(0, Number(s.maxSeats || 0) - Number(s.enrolled || 0));
      const d = dateOf(s.startDate);
      const whenLabel = (d.month || "") + (d.day || "") + "日 " + (d.weekday || "");
      const whenText = isActivity
        ? (whenLabel + " " + (s.meetupTime || "")).trim()
        : [s.startDate + (s.endDate && s.endDate !== s.startDate ? " 至 " + s.endDate : ""), s.meetupTime].filter(Boolean).join(" ");
      let statusTag = "先报名后付款";
      if (s.status === "cancelled") statusTag = "已解散";
      else if (isActivity) statusTag = isFree ? "免费局" : "同城局";
      else if (s.organizerType === "company") statusTag = "公司统一支付";
      const ticket = ticketState(s, { posted: this.data.posted, joined: this.data.joinedHint });
      this.setData({
        s,
        packing: (s.route && s.route.packingList) || [],
        gallery: (s.gallery && s.gallery.length ? s.gallery : (s.route && s.route.cover ? [s.route.cover] : [])),
        busPhotos: (s.bus && s.bus.photos) || [],
        busText: busLine(s),
        isActivity,
        isFree,
        remainSeats,
        whenLabel,
        whenText,
        peopleText: peopleLine(s),
        trusts: trustChips(s),
        ticket,
        priceDock: dockPrice(s),
        showEnroll: canShowEnroll(s),
        ctaText: enrollCta(s),
        statusTag,
        leaderSlots: [1, 2].map((slot) => ({
          slot,
          label: "领队" + slot,
          leader: ((s.leaders || []).find((l) => Number(l.slot) === slot)) || null,
        })),
        cancelSummary: (s.refundPolicy && s.refundPolicy.summary) || this.data.cancelSummary,
        cancelItems: (s.refundPolicy && s.refundPolicy.items) || this.data.cancelItems,
        refundHint: (s.refundPolicy && s.refundPolicy.current && s.refundPolicy.current.hint) || "",
      });
      wx.setNavigationBarTitle({ title: isActivity ? "局详情" : "行程详情" });
      this.loadRoute(s.routeId || (s.route && s.route.id));
      const region = s && s.route && [s.route.region, s.route.title].filter(Boolean).join(" ");
      const date = s && s.startDate;
      if (region && !isActivity) {
        request("/weather?region=" + encodeURIComponent(region) + "&date=" + (date || "")).then((w) => {
          this.setData({ weather: w.data }, () => {
            wx.nextTick(() => this.drawWeather());
          });
        }).catch(() => {});
      }
    });
    request("/schedules/" + this.data.id + "/seats").then((r) => {
      if (this.data.isActivity) {
        this.setData({ seatRows: [] });
        return;
      }
      const seats = (r.data && r.data.seats) || [];
      const groups = [];
      seats.forEach((seat) => {
        const last = groups[groups.length - 1];
        if (!last || last.row !== seat.row) groups.push({ row: seat.row, seats: [seat] });
        else last.seats.push(seat);
      });
      this.setData({ seatRows: groups });
    }).catch(() => {});
    request("/schedules/" + this.data.id + "/reviews").then((r) => {
      const data = (r && r.data) || {};
      const list = (data.list || []).map((row) => Object.assign({}, row, { stars: starText(row.rating) }));
      this.setData({ reviews: { list, count: data.count || 0, avg: data.avg || 0 } });
    }).catch(() => {});
    request("/meta").then((r) => {
      const data = (r && r.data) || {};
      const patch = {
        commonRules: data.commonRules || { title: "", summary: "", sections: [] },
        waiverText: data.waiverText || "",
        faqs: data.faqs || [],
        contacts: data.contacts || this.data.contacts,
      };
      if (!(this.data.s && this.data.s.refundPolicy)) {
        patch.cancelSummary = (data.cancelPolicy && data.cancelPolicy.summary) || "";
        patch.cancelItems = (data.cancelPolicy && data.cancelPolicy.items) || [];
      }
      this.setData(patch);
    }).catch(() => {});
  },
  loadRoute(routeId) {
    routeId = routeId || (this.data.s && (this.data.s.routeId || (this.data.s.route && this.data.s.route.id)));
    if (!routeId) return;
    request("/routes/" + routeId).then((r) => {
      const route = r.data || {};
      const used = {};
      (route.story || []).forEach((b) => {
        if (b && b.type === "image" && b.url) used[b.url] = true;
      });
      const album = (route.gallery || []).filter((url) => url && !used[url]);
      this.setData({ routeDetail: route, routeAlbum: album });
    }).catch(() => {
      this.setData({ routeDetail: (this.data.s && this.data.s.route) || {}, routeAlbum: [] });
    });
    request("/routes/" + routeId + "/reviews").then((r) => {
      const data = (r && r.data) || {};
      const list = (data.list || []).map((row) => Object.assign({}, row, { stars: starText(row.rating) }));
      this.setData({ routeReviews: { list, count: data.count || 0, avg: data.avg || 0 } });
    }).catch(() => {});
  },
  setTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.tab) return;
    this.setData({ tab }, () => {
      if (tab === "trip") wx.nextTick(() => this.drawWeather());
      wx.pageScrollTo({ selector: ".goods-tabs", duration: 0 });
    });
  },
  previewStory(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.previewImage({ urls: [url], current: url });
  },
  openMap() {
    const s = this.data.s;
    if (!s) return;
    if (s.meetupLat && s.meetupLng) {
      wx.openLocation({
        latitude: Number(s.meetupLat),
        longitude: Number(s.meetupLng),
        name: s.meetupPoint || "集合点",
        address: s.meetupPoint || "",
        scale: 16,
      });
      return;
    }
    const point = s.meetupPoint;
    if (!point) return;
    wx.setClipboardData({
      data: point,
      success: () => wx.showToast({ title: "已复制集合点", icon: "none" }),
    });
  },
  previewHero(e) {
    const urls = this.data.gallery || [];
    if (!urls.length) return;
    wx.previewImage({ urls, current: e.currentTarget.dataset.src || urls[0] });
  },
  previewBus() {
    const urls = this.data.busPhotos || [];
    if (!urls.length) return;
    wx.previewImage({ urls, current: urls[0] });
  },
  drawWeather() {
    const hourly = this.data.weather && this.data.weather.hourly;
    if (!hourly || !hourly.length) return;
    wx.createSelectorQuery().in(this)
      .select("#weatherChart")
      .fields({ node: true, size: true })
      .exec((res) => {
        const info = res && res[0];
        if (!info || !info.node) return;
        drawWeatherChart(info.node, info.width, info.height, hourly);
      });
  },
  goUser(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: "/pages/user/user?id=" + id });
  },
  goLottery() {
    wx.navigateTo({ url: "/pages/lottery/lottery?scheduleId=" + this.data.id });
  },
  onSeat(e) {
    const id = e.currentTarget.dataset.userid;
    if (id) {
      wx.navigateTo({ url: "/pages/user/user?id=" + id });
      return;
    }
    if (e.currentTarget.dataset.locked || e.currentTarget.dataset.taken) return;
    const mine = this.data.s && this.data.s.myEnrollment;
    if (mine && mine.status === "joined") {
      request("/schedules/" + this.data.id + "/seats/pick", "POST", { seatNo: e.currentTarget.dataset.no }).then(() => {
        wx.showToast({ title: "已选座", icon: "none" });
        this.load();
      }).catch((err) => wx.showToast({ title: err.message || "选座失败", icon: "none" }));
      return;
    }
    wx.showToast({ title: "早报名早选座", icon: "none" });
  },
  applyLeader() {
    const back = "/pages/schedule/schedule?id=" + this.data.id;
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent(back) });
      return;
    }
    const me = app.globalData.user || {};
    if (!me.isLeader) {
      const pending = me.leaderStatus === "pending";
      wx.showModal({
        title: pending ? "申请审核中" : "需要先申请领队",
        content: pending ? "领队申请审核中，通过后再报名领队" : "报名领队需先填写领队申请并通过审核",
        confirmText: pending ? "查看申请" : "去申请",
        success: (r) => {
          if (!r.confirm) return;
          wx.navigateTo({ url: "/pages/leader/leader?redirect=" + encodeURIComponent(back) });
        },
      });
      return;
    }
    request("/schedules/" + this.data.id + "/leaders/apply", "POST", {}).then(() => {
      wx.showToast({ title: "已报名领队", icon: "none" });
      this.load();
    }).catch((e) => {
      if (e.code === "need_leader_apply" || e.code === "leader_pending") {
        wx.showModal({
          title: "需要先申请领队",
          content: e.message,
          confirmText: "去申请",
          success: (r) => {
            if (!r.confirm) return;
            wx.navigateTo({ url: "/pages/leader/leader?redirect=" + encodeURIComponent(back) });
          },
        });
        return;
      }
      wx.showModal({ title: "报名领队失败", content: e.message, showCancel: false });
    });
  },
  applyPhotographer() {
    const back = "/pages/schedule/schedule?id=" + this.data.id;
    const enroll = "/pages/enroll/enroll?id=" + this.data.id + "&joinMode=photographer";
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent(back) });
      return;
    }
    request("/schedules/" + this.data.id + "/photographers/apply", "POST", {}).then(() => {
      wx.showToast({ title: "已报名摄影师", icon: "none" });
      this.load();
    }).catch((e) => {
      if (e.code === "need_photo_enroll") {
        wx.navigateTo({ url: enroll });
        return;
      }
      wx.showModal({ title: "报名摄影师失败", content: e.message, showCancel: false });
    });
  },
  openLeader(e) {
    const kind = e.currentTarget.dataset.kind;
    const id = e.currentTarget.dataset.id;
    const userId = e.currentTarget.dataset.userid;
    if (kind === "guide" && id) wx.navigateTo({ url: "/pages/guide/guide?id=" + id });
    else if (userId || id) wx.navigateTo({ url: "/pages/user/user?id=" + (userId || id) });
  },
  async payFor(e) {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/schedule/schedule?id=" + this.data.id) });
      return;
    }
    try {
      const code = await ensureWechatCode();
      const res = await request("/pay/for-enrollment", "POST", {
        enrollmentId: e.currentTarget.dataset.id,
        code,
      });
      await invokeWechatPay(res.data);
      wx.showToast({ title: res.data.needPay && res.data.wechatPay && !res.data.wechatPay.mock ? "支付成功" : "已支付", icon: "none" });
      this.load();
    } catch (err) {
      wx.showModal({ title: "支付失败", content: err.message, showCancel: false });
    }
  },
  copyText(e) {
    const text = e.currentTarget.dataset.text;
    if (!text) return;
    wx.setClipboardData({ data: String(text), success: () => wx.showToast({ title: "已复制", icon: "none" }) });
  },
  goOrders() {
    wx.switchTab({ url: "/pages/orders/orders" });
  },
  enroll() {
    let url = "/pages/enroll/enroll?id=" + this.data.id;
    if (this.data.coupon) url += "&coupon=" + this.data.coupon;
    wx.navigateTo({ url });
  },
  goCoupon() {
    const c = this.data.s && this.data.s.coupon;
    if (c && c.code) wx.navigateTo({ url: "/pages/coupon/coupon?code=" + c.code });
  },
  goGuide() {
    const g = this.data.s && this.data.s.guide;
    if (g && g.id) wx.navigateTo({ url: "/pages/guide/guide?id=" + g.id });
  },
  goAfter() {
    wx.navigateTo({ url: "/pages/after/after?id=" + this.data.id });
  },
  stats() { wx.navigateTo({ url: "/pages/stats/stats?id=" + this.data.id }); },
  toggleDissolve() { this.setData({ showDissolve: !this.data.showDissolve }); },
  setReason(e) { this.setData({ reason: e.detail.value }); },
  async confirmDissolve() {
    const reason = (this.data.reason || "").trim();
    if (!reason) {
      wx.showToast({ title: "请填写解散理由", icon: "none" });
      return;
    }
    try {
      const res = await request("/schedules/" + this.data.id + "/dissolve", "POST", { reason });
      this.setData({ showDissolve: false, reason: "" });
      wx.showModal({
        title: "已解散",
        content: "取消 " + res.data.cancelled + " 人，退款 " + res.data.refunded + " 人，短信 " + res.data.smsCount + " 条",
        showCancel: false,
      });
      this.load();
    } catch (e) {
      wx.showModal({ title: "解散失败", content: e.message, showCancel: false });
    }
  },
  onShareAppMessage() {
    const s = this.data.s;
    const title = s && s.route
      ? (s.organizerName || "同行者众") + "邀请你报名「" + s.route.title + "」"
      : "同行者众 · 一起出发";
    return {
      title,
      path: "/pages/schedule/schedule?id=" + this.data.id,
      imageUrl: shareCover(s && s.route && s.route.cover),
    };
  },
  onShareTimeline() {
    const s = this.data.s;
    return {
      title: (s && s.route && s.route.title) || "同行者众",
      query: "id=" + this.data.id,
    };
  },
});
