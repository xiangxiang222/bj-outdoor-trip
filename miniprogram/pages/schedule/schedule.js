const { request } = require("../../utils/request");
const { payStatusText, starText } = require("../../utils/labels");
const { absMedia } = require("../../utils/media");
const { drawWeatherChart } = require("../../utils/weather-chart");
const appearance = require("../../utils/appearance");
const { dateOf, kindOf, activityDetails, activityBody, activityEnded } = require("../../utils/activity-kind");
const { peopleLine, trustChips, dockPrice, enrollCta, canShowEnroll, ticketState, showDetailTabs } = require("../../utils/scan-facts");
const { openCampusPick } = require("../../utils/campus");
const { decodeShareScene, persistRef, readRef, enrollQuery } = require("../../utils/share-scene");
const { drawShareCard, drawSharePoster, FALLBACK_SHARE_CARD } = require("../../utils/share-card");
const { baseUrl } = require("../../config");
const app = getApp();


function activityPresentation(s) {
  const en = s.myEnrollment;
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const ended = !!s.completedAt || ["finished", "completed", "ended"].includes(s.status) || String(s.endDate || s.startDate || "").slice(0, 10) < today;
  let title = "招募中", hint = "先了解活动安排，再决定是否加入。";
  if (s.status === "cancelled") { title = "活动已取消"; hint = s.cancelReason || "本次活动已取消，请查看报名记录与退款进度。"; }
  else if (s.reviewStatus === "pending") { title = "审核中"; hint = "审核通过后开放报名。"; }
  else if (s.reviewStatus === "rejected") { title = "审核未通过"; hint = "本次活动暂未开放报名。"; }
  else if (ended) { title = "活动已结束"; hint = "本次活动已结束，报名记录为你保留。"; }
  else if (activityEnded(s)) { title = "活动已开始"; hint = "本次活动已开始，报名入口已关闭。"; }
  else if (en && en.status === "waitlist") { title = "候补中"; hint = "有人退出时按报名顺序递补，确认后可查看群信息。"; }
  else if (en && en.status === "applied") { title = "报名待确认"; hint = "名单确认后可查看本局微信群。"; }
  else if (en && en.status === "joined" && Number(en.remainAmount) > 0) { title = "待付款"; hint = "请完成剩余费用支付，支付确认后可查看群信息。"; }
  else if (en && en.status === "joined") { title = "已报名"; hint = "请核对见面时间与地点，按约定准时参加。"; }
  else if (Number(s.remain) <= 0) { title = "已满员"; hint = "可报名候补，等待空位递补。"; }
  const base = ticketState(s, {});
  const closed = ended || activityEnded(s) || s.status === "cancelled";
  const ticket = en || base ? { ...(base || {}), kind: "activity", title, sub: hint, trips: !!en, share: !closed } : null;
  return { title, hint, ended, closed, ticket };
}

function canDissolveSchedule(s) {
  if (!s) return false;
  if (typeof s.canDissolve === "boolean") return s.canDissolve;
  if (!s.isOrganizer || s.status === "cancelled") return false;
  if (s.channel === "activity" && ["pending", "rejected"].includes(s.reviewStatus) && !s.startedAt && !s.completedAt && !["finished", "completed", "ended"].includes(s.status)) return true;
  return s.channel !== "activity" || !activityEnded(s);
}

function uploadedGroupQr(value) {
  const url = String(value || "").trim();
  return /^(?:https?:\/\/[^/?#]+)?\/static\/uploads\/[\w-]+\.(?:png|jpe?g|webp|gif)(?:\?[^#]*)?$/i.test(url) ? url : "";
}

function busLine(s) {
  const b = s && s.bus;
  if (!b) return "车型待确认";
  const bits = [b.name];
  if (b.seats) bits.push(b.seats + " 座");
  bits.push(b.plateNo ? b.plateNo : "车号待确认");
  return bits.join(" · ");
}

function storyBits(route) {
  route = route || {};
  const highlights = (route.highlights || []).filter((line) => typeof line === "string" && line.trim());
  const sellLine = route.subtitle || highlights[0] || "";
  return {
    sellLine,
    highlights: highlights.filter((line) => line !== sellLine).slice(0, 3).map((line, i) => ({ n: i + 1, line })),
    itinerary: route.itinerary || [],
    feeInclude: route.feeInclude || "",
    feeExclude: route.feeExclude || "",
    equipment: route.equipment || "",
  };
}

function quoteSnippet(list) {
  const row = list && list[0];
  const raw = String((row && row.content) || "").replace(/\s+/g, " ").trim();
  if (!raw) return { text: "", virtual: false };
  return {
    text: raw.length > 18 ? raw.slice(0, 18) + "…" : raw,
    virtual: !!row.virtual,
  };
}

Page({
  data: {
    detailDark: false,
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
    canDissolve: false,
    dissolving: false,
    dissolveErr: "",
    activityGroupQr: "",
    activityGroupQrError: false,
    reason: "",
    addCollege: "",
    addSchool: "",
    addMajor: "",
    seatRows: [],
    weather: null,
    reviews: { list: [], count: 0, avg: 0 },
    reviewsReady: false,
    seatsReady: false,
    routeReviewsReady: false,
    loadErr: "",
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
    showDetailTabs: false,
    showAfter: false,
    ctaText: "立即报名",
    statusTag: "",
    sellLine: "",
    highlights: [],
    itinerary: [],
    feeInclude: "",
    feeExclude: "",
    equipment: "",
    reviewQuote: "",
    reviewQuoteVirtual: false,
    posted: "",
    joinedHint: "",
    inboundJoinCode: "",
    ref: "",
    shareCardPath: "",
    shareTitle: "",
    showPoster: false,
    posterQr: "",
    posterCover: "",
    posterHint: "",
    mergeTpl: "",
    leaderSlots: [{ slot: 1, label: "领队1", leader: null }, { slot: 2, label: "领队2", leader: null }],
  },
  onLoad(q) {
    const scene = decodeShareScene(q.scene || q.q || "");
    const id = q.id || scene.id;
    const ref = persistRef(id, q.ref || scene.ref) || readRef(id);
    const tab = ["trip", "route", "rules"].includes(q.tab) ? q.tab : "trip";
    this.setData({
      id,
      coupon: q.coupon || "",
      posted: q.posted || "",
      joinedHint: q.joined || "",
      inboundJoinCode: q.joinCode || q.code || scene.joinCode || "",
      ref,
      tab,
    });
    wx.showShareMenu({ withShareTicket: true, menus: ["shareAppMessage", "shareTimeline"] });
  },
  onShow() {
    this.setData({ detailDark: appearance.isDark() });
    this.load();
  },
  onUnload() {
    this._shareUnloaded = true;
    this._shareTask = null;
  },
  load() {
    this.setData({ reviewsReady: false, routeReviewsReady: false, seatsReady: false, loadErr: "" });
    request("/schedules/" + this.data.id).then((r) => {
      const s = r.data;
      if (s && s.chain) {
        s.chain = s.chain.map((c) => Object.assign({}, c, {
          payText: c.canPay && c.paidAmount > 0
            ? "已付 ¥" + c.paidAmount + " / ¥" + c.payAmount
            : payStatusText(c.payStatus),
        }));
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
      let statusTag = "招募中";
      if (s.status === "cancelled") statusTag = "已解散";
      else if (isActivity) statusTag = isFree ? "免费局" : "同城局";
      else if (s.guaranteed || s.status === "confirmed") statusTag = "已成团";
      else if (s.status === "full") statusTag = "已满员";
      else if (s.status === "finished") statusTag = "已结束";
      const presentation = isActivity ? activityPresentation(s) : null;
      const ticket = isActivity ? presentation.ticket : ticketState(s, { posted: this.data.posted, joined: this.data.joinedHint });
      if (presentation) statusTag = presentation.title;
      this.setData({
        s,
        packing: !isActivity && (s.route && s.route.packingList) || [],
        gallery: (s.gallery && s.gallery.length ? s.gallery : (s.route && s.route.cover ? [s.route.cover] : [])),
        busPhotos: (s.bus && s.bus.photos) || [],
        busText: busLine(s),
        isActivity,
        canDissolve: canDissolveSchedule(s),
        activityGroupQr: uploadedGroupQr(s.consultGroupQr),
        activityGroupQrError: false,
        activityInfo: isActivity ? activityDetails(s) : [],
        activityHighlights: isActivity ? activityDetails(s).slice(0, 2) : [],
        activityKind: isActivity ? kindOf(s) : null,
        activityHint: presentation ? presentation.hint : "",
        activityClosed: presentation ? presentation.closed : false,
        activityTitle: presentation ? presentation.title : "",
        activityEnded: presentation ? presentation.ended : false,
        activityIntro: isActivity ? activityBody(s) : "",
        activityIsOver: isActivity && activityEnded(s),
        isFree,
        remainSeats,
        whenLabel,
        whenText,
        peopleText: isActivity && presentation.closed ? "已报名 " + Number(s.enrolled || 0) + " 人" : peopleLine(s),
        activityGroupHint: presentation && presentation.closed ? "本次活动的群信息，供已确认参加者查看" : "见面前，先和同好打声招呼",
        activityGroupEmpty: isActivity && !s.isOrganizer && (!s.myEnrollment || s.myEnrollment.status !== "joined" || Number(s.myEnrollment.remainAmount) > 0)
          ? (presentation.closed ? "本次活动已关闭，群信息仅向已确认参加者开放。" : "确认参加并完成支付后可查看群信息。")
          : (presentation && presentation.closed ? "发起人未提供本次活动的群信息。" : "发起人暂未提供群信息，请按活动安排到场。"),
        trusts: trustChips(s),
        ticket,
        priceDock: dockPrice(s),
        showEnroll: canShowEnroll(s) && !s.completedAt && !["finished", "completed", "ended"].includes(s.status),
        showDetailTabs: showDetailTabs(s),
        showAfter: !!(s.completedAt && s.myEnrollment && s.myEnrollment.status === "joined"),
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
        routeDetail: (s.route && s.route.title) ? s.route : this.data.routeDetail,
        ...storyBits(isActivity ? {} : s.route),
      }, () => {
        if (!isActivity) this.loadRoute(s.routeId || (s.route && s.route.id));
        else this.setData({ routeReviewsReady: true });
        this.loadExtras();
        this.prepareShare(s);
      });
      const navTitle = (s.route && s.route.title) || (isActivity ? "局详情" : "团期");
      wx.setNavigationBarTitle({ title: String(navTitle).slice(0, 12) });
      const region = s && s.route && [s.route.region, s.route.title].filter(Boolean).join(" ");
      const date = s && s.startDate;
      if (region && !isActivity) {
        request("/weather?region=" + encodeURIComponent(region) + "&date=" + (date || "")).then((w) => {
          this.setData({ weather: w.data }, () => {
            wx.nextTick(() => this.drawWeather());
          });
        }).catch(() => {});
      }
    }).catch(() => this.setData({ loadErr: "加载失败" }));
  },
  loadExtras() {
    if (!this.data.isActivity) request("/schedules/" + this.data.id + "/seats").then((r) => {
      if (this.data.isActivity) {
        this.setData({ seatRows: [], seatsReady: true });
        return;
      }
      const seats = (r.data && r.data.seats) || [];
      const groups = [];
      seats.forEach((seat) => {
        const last = groups[groups.length - 1];
        if (!last || last.row !== seat.row) groups.push({ row: seat.row, seats: [seat] });
        else last.seats.push(seat);
      });
      this.setData({ seatRows: groups, seatsReady: true });
    }).catch(() => this.setData({ seatsReady: true }));
    request("/schedules/" + this.data.id + "/reviews").then((r) => {
      const data = (r && r.data) || {};
      const list = (data.list || []).map((row) => Object.assign({}, row, { stars: starText(row.rating) }));
      const quote = quoteSnippet(list);
      this.setData({
        reviews: { list, count: data.count || 0, avg: data.avg || 0 },
        reviewQuote: quote.text,
        reviewQuoteVirtual: quote.virtual,
        reviewsReady: true,
      });
    }).catch(() => this.setData({ reviewsReady: true }));
    request("/meta").then((r) => {
      const data = (r && r.data) || {};
      const patch = {
        commonRules: data.commonRules || { title: "", summary: "", sections: [] },
        waiverText: data.waiverText || "",
        faqs: data.faqs || [],
        contacts: data.contacts || this.data.contacts,
        mergeTpl: (data.subscribeTemplates && data.subscribeTemplates.merge) || "",
      };
      if (!(this.data.s && this.data.s.refundPolicy)) {
        patch.cancelSummary = (data.cancelPolicy && data.cancelPolicy.summary) || "";
        patch.cancelItems = (data.cancelPolicy && data.cancelPolicy.items) || [];
      }
      this.setData(patch);
    }).catch(() => {});
  },
  loadRoute(routeId) {
    if (this.data.isActivity) { this.setData({ routeReviewsReady: true }); return; }
    routeId = routeId || (this.data.s && (this.data.s.routeId || (this.data.s.route && this.data.s.route.id)));
    if (!routeId) {
      this.setData({ routeReviewsReady: true });
      return;
    }
    request("/routes/" + routeId).then((r) => {
      const route = r.data || {};
      delete route.schedules;
      const used = {};
      (route.story || []).forEach((b) => {
        if (b && b.type === "image" && b.url) used[b.url] = true;
      });
      const album = (route.gallery || []).filter((url) => url && !used[url]);
      this.setData(Object.assign({ routeDetail: route, routeAlbum: album }, storyBits(route)));
    }).catch(() => {
      this.setData({ routeDetail: (this.data.s && this.data.s.route) || {}, routeAlbum: [] });
    });
    request("/routes/" + routeId + "/reviews").then((r) => {
      const data = (r && r.data) || {};
      const list = (data.list || []).map((row) => Object.assign({}, row, { stars: starText(row.rating) }));
      this.setData({ routeReviews: { list, count: data.count || 0, avg: data.avg || 0 }, routeReviewsReady: true });
    }).catch(() => this.setData({ routeReviewsReady: true }));
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
  previewDay(e) {
    const src = e.currentTarget.dataset.src;
    if (!src) return;
    wx.previewImage({ urls: [src], current: src });
  },
  jumpReviews() {
    this.setData({ tab: "trip" }, () => {
      wx.pageScrollTo({ selector: "#trip-reviews", duration: 200 });
    });
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
        drawWeatherChart(info.node, info.width, info.height, hourly, {
          dark: this.data.detailDark,
          fontScale: this.data.previewScale || 1,
        });
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
    let enroll = "/pages/enroll/enroll?" + enrollQuery(this, "joinMode=photographer");
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
  openPay(e) {
    const token = e.currentTarget.dataset.token;
    if (!token) {
      wx.showToast({ title: "暂时无法打开支付", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/pay/pay?token=" + token });
  },
  invitePay() {
    const mine = this.data.s && this.data.s.myEnrollment;
    if (!mine || !mine.payShareToken) {
      wx.showToast({ title: "暂时无法分享付款", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/pay/pay?token=" + mine.payShareToken });
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
    const s = this.data.s;
    if (!canShowEnroll(s) || s.completedAt || ["finished", "completed", "ended"].includes(s.status)) {
      wx.showToast({ title: s && s.channel === "activity" && activityEnded(s) ? "本次活动已关闭报名" : "本次行程暂不可报名", icon: "none" });
      this.load();
      return;
    }
    wx.navigateTo({ url: "/pages/enroll/enroll?" + enrollQuery(this) });
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
  toggleDissolve() {
    if (this.data.dissolving) return;
    if (this.data.showDissolve) { this.setData({ showDissolve: false }); return; }
    if (!canDissolveSchedule(this.data.s)) { this.load(); return; }
    this.setData({ showDissolve: true, dissolveErr: "" });
  },
  stopTap() {},
  groupQrError() { this.setData({ activityGroupQr: "", activityGroupQrError: true }); },
  retryGroupQr() { this.setData({ activityGroupQr: uploadedGroupQr(this.data.s && this.data.s.consultGroupQr), activityGroupQrError: false }); },
  setReason(e) { this.setData({ reason: e.detail.value }); },
  goStudent() {
    wx.navigateTo({ url: "/pages/student/student?redirect=" + encodeURIComponent("/pages/schedule/schedule?id=" + this.data.id) });
  },
  setAddCollege(e) { this.setData({ addCollege: e.detail.value }); },
  setAddSchool(e) { this.setData({ addSchool: e.detail.value }); },
  setAddMajor(e) { this.setData({ addMajor: e.detail.value }); },
  pickAddSchool() {
    openCampusPick({
      kind: "school",
      title: "开放学校",
      selected: this.data.addSchool,
      onPick: (names) => this.setData({ addSchool: names[0] || "", addCollege: "", addMajor: "" }),
    });
  },
  pickAddCollege() {
    if (!this.data.addSchool) {
      wx.showToast({ title: "请先选择学校", icon: "none" });
      return;
    }
    openCampusPick({
      kind: "college",
      school: this.data.addSchool,
      title: "开放学院",
      selected: this.data.addCollege,
      onPick: (names) => this.setData({ addCollege: names[0] || "", addMajor: "" }),
    });
  },
  pickAddMajor() {
    if (!this.data.addCollege) {
      wx.showToast({ title: "请先选择学院", icon: "none" });
      return;
    }
    openCampusPick({
      kind: "major",
      school: this.data.addSchool,
      college: this.data.addCollege,
      title: "开放专业",
      selected: this.data.addMajor,
      onPick: (names) => this.setData({ addMajor: names[0] || "" }),
    });
  },
  expandTarget() {
    if (!this.data.addSchool) {
      wx.showToast({ title: "请先选择学校", icon: "none" });
      return;
    }
    this.expandLimit({ addTargets: [{ school: this.data.addSchool, college: this.data.addCollege, major: this.data.addMajor }] });
  },
  expandAllColleges() { this.expandLimit({ openAllColleges: true }); },
  async expandLimit(body) {
    try {
      const res = await request("/schedules/" + this.data.id + "/limit", "PUT", body);
      this.setData({ addCollege: "", addSchool: "", addMajor: "" });
      wx.showToast({ title: "已开放：" + ((res.data.eligibility && res.data.eligibility.label) || "报名范围"), icon: "none" });
      this.load();
    } catch (e) {
      wx.showModal({ title: "无法开放", content: e.message || "请稍后重试", showCancel: false });
    }
  },
  async confirmDissolve() {
    if (this.data.dissolving) return;
    if (!canDissolveSchedule(this.data.s)) { this.setData({ showDissolve: false }); this.load(); return; }
    const reason = (this.data.reason || "").trim();
    if (!reason) {
      this.setData({ dissolveErr: this.data.isActivity ? "请填写取消原因" : "请填写解散理由" });
      return;
    }
    this.setData({ dissolving: true, dissolveErr: "" });
    try {
      const res = await request("/schedules/" + this.data.id + "/dissolve", "POST", { reason });
      this.setData({ showDissolve: false, reason: "" });
      wx.showModal({
        title: this.data.isActivity ? "活动已取消" : "已解散",
        content: "已取消 " + Number(res.data.cancelled || 0) + " 人的报名" + (Number(res.data.refunded) > 0 ? "，已为 " + res.data.refunded + " 人处理退款，请留意原支付渠道。" : "。"),
        showCancel: false,
      });
      this.load();
    } catch (e) {
      this.setData({ dissolveErr: e.message || "取消失败，请重试" });
    } finally { this.setData({ dissolving: false }); }
  },
  prepareShare(s) {
    const quote = (s && s.quote) || {};
    const id = this.data.id;
    const cover = absMedia((s.gallery && s.gallery[0]) || (s.route && s.route.cover) || "", baseUrl);
    const facts = {
      title: (s.route && s.route.title) || "行程",
      cover,
      kindLabel: s.kindLabel || "个人",
      originPrice: quote.originPrice,
      memberPrice: quote.memberPrice,
      studentPrice: quote.studentPrice,
      price: quote.price,
      free: Number(quote.price || 0) === 0 && Number(quote.originPrice || 0) === 0,
      startDate: s.startDate,
      meetupTime: s.meetupTime,
      meetupPoint: s.meetupPoint,
      enrolled: s.enrolled,
      maxSeats: s.maxSeats,
      minGroup: s.minGroupSize,
      organizerName: s.organizerName,
    };
    this._shareFacts = facts;
    const title = facts.free ? facts.title + " 免费报名" : facts.title + " ¥" + Math.round(Number(facts.price || 0)) + " 立即报名";
    this.setData({ shareTitle: title, posterCover: cover });
    const metaVersion = this._shareMetaVersion = (this._shareMetaVersion || 0) + 1;
    request("/schedules/" + id + "/poster").then((res) => {
      if (this._shareUnloaded || this._shareMetaVersion !== metaVersion || this.data.id !== id) return;
      const data = (res && res.data) || {};
      if (data.referralCode) persistRef(id, data.referralCode);
      this.setData({
        ref: data.referralCode || this.data.ref,
        posterQr: data.qr || this.data.posterQr,
      });
    }).catch(() => {});
    // Refreshing the same page must not restart a pending render or discard its PNG.
    const key = JSON.stringify([id, facts.title, facts.cover, facts.price, facts.free]);
    if (this._shareTask && this._shareTask.key === key) return this._shareTask.promise;
    const task = { key };
    this._shareTask = task;
    this.setData({ shareCardPath: "" });
    task.promise = new Promise((resolve) => wx.nextTick(resolve))
      .then(() => drawShareCard(this, facts))
      .catch(() => FALLBACK_SHARE_CARD)
      .then((path) => {
        if (!this._shareUnloaded && this._shareTask === task) this.setData({ shareCardPath: path });
        return path;
      });
    return task.promise;
  },
  shareResult(content) {
    const task = this._shareTask;
    if (!task || this.data.shareCardPath) return content;
    // WeChat falls back to the synchronous fields after 3 seconds. Both paths
    // always use a complete card, never a raw cover or an automatic screenshot.
    const promise = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(content), 2400);
      task.promise.then((imageUrl) => {
        clearTimeout(timer);
        resolve({ ...content, imageUrl });
      });
    });
    return { ...content, promise };
  },
  openPoster() {
    this.setData({ showPoster: true, posterHint: "正在生成带二维码的详情图…" });
    request("/schedules/" + this.data.id + "/poster").then((res) => {
      const data = (res && res.data) || {};
      if (data.referralCode) persistRef(this.data.id, data.referralCode);
      this.setData({
        posterQr: data.qr || "",
        ref: data.referralCode || this.data.ref,
        posterHint: "把海报发给好友，扫码即可报名",
      });
    }).catch(() => this.setData({ posterHint: "二维码生成失败，仍可转发小程序卡片" }));
  },
  closePoster() {
    this.setData({ showPoster: false });
  },
  savePoster() {
    const facts = this._shareFacts || {};
    drawSharePoster(this, facts, this.data.posterQr).then((path) => {
      wx.saveImageToPhotosAlbum({
        filePath: path,
        success: () => wx.showToast({ title: "已保存到相册", icon: "none" }),
        fail: () => {
          wx.previewImage({ urls: [path] });
          wx.showToast({ title: "请长按图片保存", icon: "none" });
        },
      });
    }).catch(() => wx.showToast({ title: "保存失败，可长按二维码截图", icon: "none" }));
  },
  onShareAppMessage() {
    const s = this.data.s;
    const title = this.data.shareTitle || (s && s.route
      ? (s.organizerName || "同行者众") + "邀请你报名「" + s.route.title + "」"
      : "同行者众 · 一起出发");
    let path = "/pages/schedule/schedule?id=" + this.data.id;
    const ref = this.data.ref;
    if (ref) path += "&ref=" + encodeURIComponent(ref);
    if (s && s.joinCode) path += "&joinCode=" + encodeURIComponent(s.joinCode);
    return this.shareResult({
      title,
      path,
      imageUrl: this.data.shareCardPath || FALLBACK_SHARE_CARD,
    });
  },
  onShareTimeline() {
    const s = this.data.s;
    let query = "id=" + this.data.id;
    if (this.data.ref) query += "&ref=" + encodeURIComponent(this.data.ref);
    return this.shareResult({
      title: this.data.shareTitle || ((s && s.route && s.route.title) || "同行者众"),
      query,
      imageUrl: this.data.shareCardPath || FALLBACK_SHARE_CARD,
    });
  },
});
