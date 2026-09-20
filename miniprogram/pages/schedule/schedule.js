const { request, setAuth } = require("../../utils/request");
const { invokeWechatPay, ensureWechatCode } = require("../../utils/pay");
const { payStatusText, starText } = require("../../utils/labels");
const { shareCover, absMedia } = require("../../utils/media");
const { drawWeatherChart } = require("../../utils/weather-chart");
const { dateOf } = require("../../utils/activity-kind");
const { peopleLine, trustChips, dockPrice, enrollCta, canShowEnroll, ticketState } = require("../../utils/scan-facts");
const { openCampusPick } = require("../../utils/campus");
const { decodeShareScene, persistRef, readRef, enrollQuery } = require("../../utils/share-scene");
const { drawShareCard, drawSharePoster, douyinShareText } = require("../../utils/share-card");
const { baseUrl } = require("../../config");
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
    addCollege: "",
    addSchool: "",
    addMajor: "",
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
  onShow() { this.load(); },
  load() {
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
      this.prepareShare(s);
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
  async payFor(e) {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/schedule/schedule?id=" + this.data.id) });
      return;
    }
    const enrollmentId = e.currentTarget.dataset.id;
    const channel = e.currentTarget.dataset.channel || "";
    try {
      const payload = { enrollmentId, channel };
      if (channel !== "wallet") payload.code = await ensureWechatCode();
      const res = await request("/pay/for-enrollment", "POST", payload);
      await invokeWechatPay(res.data);
      if (res.data.user) setAuth(app.globalData.token, res.data.user);
      else if (channel === "wallet") {
        const me = await request("/me");
        setAuth(app.globalData.token, me.data);
      }
      wx.showToast({ title: res.data.payStatus === "paid" ? "已付清" : "已支付", icon: "none" });
      this.load();
    } catch (err) {
      wx.showModal({ title: "支付失败", content: err.message, showCancel: false });
    }
  },
  payMine() {
    const mine = this.data.s && this.data.s.myEnrollment;
    if (!mine) return;
    const remain = Number(mine.remainAmount || 0);
    const bal = Number((app.globalData.user && app.globalData.user.walletBalance) || 0);
    if (bal >= remain && remain > 0) {
      wx.showActionSheet({
        itemList: ["余额支付 ¥" + remain, "微信支付"],
        success: (res) => {
          this.payFor({
            currentTarget: { dataset: { id: mine.id, channel: res.tapIndex === 0 ? "wallet" : "" } },
          });
        },
      });
      return;
    }
    this.payFor({ currentTarget: { dataset: { id: mine.id } } });
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
  copyDouyin() {
    const s = this.data.s || {};
    const origin = String(baseUrl || "http://togetherbetter.cn").replace(/\/$/, "");
    let url = origin + "/m/schedule/" + this.data.id;
    if (this.data.ref) url += (url.indexOf("?") >= 0 ? "&" : "?") + "ref=" + encodeURIComponent(this.data.ref);
    const text = douyinShareText({
      organizerName: s.organizerName,
      title: s.route && s.route.title,
      startDate: s.startDate,
      enrolled: s.enrolled,
      url,
      joinCode: s.joinCode,
    });
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: "已复制抖音文案", icon: "none" }),
    });
  },
  copyVideo(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    const provider = e.currentTarget.dataset.provider || "";
    const toast =
      provider === "douyin" ? "已复制，打开抖音观看" : provider === "tiktok" ? "已复制，打开 TikTok 观看" : "链接已复制";
    wx.setClipboardData({
      data: String(url),
      success: () => wx.showToast({ title: toast, icon: "none" }),
    });
  },
  goOrders() {
    wx.switchTab({ url: "/pages/orders/orders" });
  },
  enroll() {
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
  toggleDissolve() { this.setData({ showDissolve: !this.data.showDissolve }); },
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
  prepareShare(s) {
    const quote = (s && s.quote) || {};
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
    request("/schedules/" + this.data.id + "/poster").then((res) => {
      const data = (res && res.data) || {};
      if (data.referralCode) persistRef(this.data.id, data.referralCode);
      this.setData({
        ref: data.referralCode || this.data.ref,
        posterQr: data.qr || this.data.posterQr,
      });
    }).catch(() => {});
    wx.nextTick(() => {
      drawShareCard(this, facts).then((path) => this.setData({ shareCardPath: path })).catch(() => {});
    });
  },
  openPoster() {
    this.setData({ showPoster: true, posterHint: "正在生成带二维码的详情图…" });
    request("/schedules/" + this.data.id + "/poster").then((res) => {
      const data = (res && res.data) || {};
      if (data.referralCode) persistRef(this.data.id, data.referralCode);
      this.setData({
        posterQr: data.qr || "",
        ref: data.referralCode || this.data.ref,
        posterHint: data.referralCode ? "好友扫码报名，成团后你拿团费 5%" : "登录后分享可绑定你的推荐返点",
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
    return {
      title,
      path,
      imageUrl: this.data.shareCardPath || shareCover(s && s.route && s.route.cover),
    };
  },
  onShareTimeline() {
    const s = this.data.s;
    let query = "id=" + this.data.id;
    if (this.data.ref) query += "&ref=" + encodeURIComponent(this.data.ref);
    return {
      title: this.data.shareTitle || ((s && s.route && s.route.title) || "同行者众"),
      query,
      imageUrl: this.data.shareCardPath || shareCover(s && s.route && s.route.cover),
    };
  },
});
