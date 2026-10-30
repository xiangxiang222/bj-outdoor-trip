const { request } = require("../../utils/request");
const { isDark } = require("../../utils/appearance");
const app = getApp();
const PAGE = "/pages/wishes/wishes";
const CATEGORIES = [
  { key:"drink",label:"一杯好喝的",title:"请你喝杯喜欢的",description:"一杯奶茶，也是一份惦记" },
  { key:"meal",label:"一起吃饭",title:"好好吃一顿饭",description:"把想见面，变成一顿饭" },
  { key:"outing",label:"去看风景",title:"去看看想看的风景",description:"留一点时间，一起走走" },
  { key:"show",label:"看场演出",title:"一起看场演出",description:"把喜欢的现场留给你" },
  { key:"transport",label:"一张车票",title:"送你一程好心情",description:"心意，陪你去往下一站" },
  { key:"trip",label:"一起出发",title:"让心意陪你出发",description:"可关联已有的真实行程订单" },
  { key:"other",label:"自定义心愿",title:"一份小小的心意",description:"写下属于你们的小美好" },
];
function newKey(prefix) { return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 10); }
function amount(value) { const n = Number(value); return Number.isFinite(n) ? String(Math.max(0, Math.round(n * 100) / 100)) : "0"; }
function dateLabel(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.replace(/-/g, ".");
  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime())) return "";
  const shanghai = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const month = String(shanghai.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shanghai.getUTCDate()).padStart(2, "0");
  return shanghai.getUTCFullYear() + "." + month + "." + day;
}
function decorate(wish) {
  const data = { ...wish };
  data.categoryLabel = (CATEGORIES.find((row) => row.key === data.kind) || CATEGORIES[6]).label;
  data.dateLabel = dateLabel(data.createdAt);
  data.stateLabel = data.status === "closed" ? "已关闭" : data.status === "completed" || data.claimStatus === "completed" ? "已安排" : data.order ? data.order.payStatus === "refunded" ? "已退款" : data.order.cancelled ? "报名已取消" : data.order.payStatus === "paid" ? "团费已付清" : "旅行心意" : data.claimStatus === "claimed" ? "有人安排啦" : "等待认领";
  data.blessings = (Array.isArray(data.blessings) ? data.blessings : []).map((row) => ({ ...row,dateLabel:dateLabel(row.createdAt) }));
  data.alreadyBlessed = !!data.hasBlessed || data.blessings.some((row) => row.self);
  if (data.order) {
    const total = Math.max(0,Number(data.order.payAmount) || 0);
    const paid = Math.max(0,Number(data.order.paidAmount) || 0);
    data.order = { ...data.order,total:amount(total),paid:amount(paid),remaining:amount(data.order.remainAmount),dateLabel:dateLabel(data.order.startDate),progress:total > 0 ? Math.min(100, Math.round(paid / total * 100)) : 0 };
  }
  return data;
}
function uncertain(error) { return !error.status || error.status >= 500 || error.networkError; }

Page({
  data: {
    view:"hub",token:"",kind:"drink",categories:CATEGORIES,dark:false,loggedIn:false,
    ready:false,refreshing:false,error:"",metaError:"",tab:"created",items:[],hasMore:false,listError:"",loadingMore:false,
    title:CATEGORIES[0].title,recipientName:"",note:"",errors:{},linkOrder:false,orders:[],ordersReady:false,ordersLoading:false,ordersError:"",selectedOrder:null,
    wish:null,busy:false,actionError:"",feedback:"",blessing:"",createUncertain:false,blessUncertain:false,
  },
  onLoad(query = {}) {
    this._unloaded = false;
    this._seq = 0;
    this._orderSeq = 0;
    this._epoch = 0;
    this._accountToken = app.globalData.token || "";
    this._kindTouchedTitle = false;
    const kind = CATEGORIES.some((row) => row.key === query.kind) ? query.kind : "drink";
    const token = String(query.token || "");
    this._requestedEnrollmentId = kind === "trip" && /^[1-9]\d*$/.test(String(query.enrollmentId || "")) ? Number(query.enrollmentId) : null;
    this.setData({ view:token ? "detail" : query.view === "new" ? "new" : "hub", token,kind,title:(CATEGORIES.find((row) => row.key === kind)).title,loggedIn:!!this._accountToken,linkOrder:!!this._requestedEnrollmentId });
  },
  onShow() {
    this.setData({ dark:isDark() });
    const token = app.globalData.token || "";
    if (this._accountToken !== token) {
      this._accountToken = token;
      this._seq++;
      this._orderSeq++;
      this._epoch++;
      this._mutation = null;
      this._createIntent = null;
      this._blessIntent = null;
      this._cursor = "";
      this._requestedEnrollmentId = null;
      this._kindTouchedTitle = false;
      this.setData({ loggedIn:!!token,items:[],wish:null,ready:false,refreshing:false,busy:false,orders:[],ordersReady:false,ordersLoading:false,selectedOrder:null,linkOrder:false,title:(this.data.categories.find((row) => row.key === this.data.kind) || CATEGORIES[0]).title,recipientName:"",note:"",blessing:"",createUncertain:false,blessUncertain:false,error:"",actionError:"",feedback:"",errors:{} });
    }
    if (this.data.busy) return;
    return this.refresh();
  },
  onUnload() { this._unloaded = true; this._seq++; this._orderSeq++; this._mutation = null; },
  async onPullDownRefresh() { try { await this.refresh(); } finally { wx.stopPullDownRefresh(); } },
  context() { return { account:app.globalData.token || "",share:this.data.token,view:this.data.view,epoch:this._epoch }; },
  live(context) { return !this._unloaded && context.epoch === this._epoch && context.account === (app.globalData.token || "") && context.share === this.data.token && context.view === this.data.view; },
  currentUrl() { return PAGE + (this.data.token ? "?token=" + encodeURIComponent(this.data.token) : this.data.view === "new" ? "?view=new&kind=" + this.data.kind + (this.data.linkOrder && this.data.selectedOrder ? "&enrollmentId=" + this.data.selectedOrder.enrollmentId : this._requestedEnrollmentId ? "&enrollmentId=" + this._requestedEnrollmentId : "") : ""); },
  login() { wx.navigateTo({ url:"/pages/login/login?redirect=" + encodeURIComponent(this.currentUrl()) }); },
  requireLogin() { if (app.globalData.token) return true; this.login(); return false; },
  refresh() {
    if (this.data.busy) return Promise.resolve();
    if (this.data.view === "detail") return this.loadWish();
    if (this.data.view === "hub") return this.loadHub();
    this.setData({ ready:true });
    if (this.data.linkOrder) return this.loadOrders();
    return Promise.resolve();
  },
  async loadHub() {
    if (this.data.refreshing) return;
    const context = this.context();
    const seq = ++this._seq;
    this.setData({ refreshing:true,listError:"",metaError:"" });
    const results = await Promise.allSettled([request("/wishes/meta"), context.account ? request("/me/wishes?tab=" + this.data.tab) : Promise.resolve(null)]);
    if (!this.live(context) || seq !== this._seq) return;
    const meta = results[0];
    const list = results[1];
    if (meta.status === "fulfilled") {
      const rows = meta.value.data && meta.value.data.categories;
      if (Array.isArray(rows) && rows.length) this.setData({ categories:CATEGORIES.map((row) => ({ ...row,...(rows.find((item) => item.key === row.key) || {}) })) });
    } else this.setData({ metaError:"心愿模板暂时未更新，可重试" });
    if (list.status === "fulfilled") {
      const data = list.value && list.value.data || {};
      this._cursor = data.nextCursor || "";
      this.setData({ items:(data.items || []).map(decorate),hasMore:!!data.hasMore });
    } else this.setData({ listError:list.reason.message || "心愿记录加载失败，请重试" });
    this.setData({ ready:true,refreshing:false });
  },
  async loadMore() {
    if (!this.data.hasMore || !this._cursor || this.data.loadingMore || this.data.refreshing) return;
    const context = this.context();
    const seq = this._seq;
    this.setData({ loadingMore:true,listError:"" });
    try {
      const result = await request("/me/wishes?tab=" + this.data.tab + "&cursor=" + encodeURIComponent(this._cursor));
      if (!this.live(context) || seq !== this._seq) return;
      const data = result.data || {};
      const existing = new Set(this.data.items.map((row) => row.token));
      this._cursor = data.nextCursor || "";
      this.setData({ items:this.data.items.concat((data.items || []).filter((row) => !existing.has(row.token)).map(decorate)),hasMore:!!data.hasMore });
    } catch (error) { if (this.live(context) && seq === this._seq) this.setData({ listError:error.message || "心愿记录加载失败，请重试" }); }
    finally { if (this.live(context) && seq === this._seq) this.setData({ loadingMore:false }); }
  },
  setTab(event) {
    const tab = event.currentTarget.dataset.tab === "joined" ? "joined" : "created";
    if (this.data.tab === tab || this.data.refreshing) return;
    this._cursor = "";
    this.setData({ tab,items:[],hasMore:false,loadingMore:false });
    return this.loadHub();
  },
  goNew(event) {
    const kind = event && event.currentTarget.dataset.kind || "drink";
    const url = PAGE + "?view=new&kind=" + kind;
    wx.navigateTo({ url:app.globalData.token ? url : "/pages/login/login?redirect=" + encodeURIComponent(url) });
  },
  goWish(event) { const token = event.currentTarget.dataset.token; if (token) wx.navigateTo({ url:PAGE + "?token=" + encodeURIComponent(token) }); },
  goHub() { wx.navigateTo({ url:PAGE }); },
  selectKind(event) {
    if (this.data.busy || this.data.createUncertain) return;
    const kind = event.currentTarget.dataset.kind;
    const category = this.data.categories.find((row) => row.key === kind);
    if (!category) return;
    this.setData({ kind,...(!this._kindTouchedTitle ? { title:category.title } : {}),linkOrder:kind === "trip" && this.data.linkOrder,selectedOrder:kind === "trip" ? this.data.selectedOrder : null,errors:{},actionError:"" });
  },
  onField(event) {
    if (this.data.busy || this.data.createUncertain) return;
    const field = event.currentTarget.dataset.field;
    if (!["title","recipientName","note"].includes(field) || field === "recipientName" && this.data.linkOrder) return;
    if (field === "title") this._kindTouchedTitle = true;
    this.setData({ [field]:event.detail.value,errors:{ ...this.data.errors,[field]:"" },actionError:"" });
  },
  toggleOrder(event) {
    if (this.data.busy || this.data.createUncertain) return;
    if (!this.requireLogin()) return;
    const linkOrder = !!event.detail.value;
    this.setData({ linkOrder,selectedOrder:null,errors:{},actionError:"" });
    if (linkOrder) return this.loadOrders();
  },
  async loadOrders() {
    if (!app.globalData.token || this.data.ordersLoading) return;
    const context = this.context();
    const seq = ++this._orderSeq;
    this.setData({ ordersLoading:true,ordersError:"" });
    try {
      const result = await request("/me/wish-orders");
      if (!this.live(context) || seq !== this._orderSeq) return;
      const orders = ((result.data && result.data.items) || []).map((row) => ({ ...row,dateLabel:dateLabel(row.startDate),remaining:amount(row.remainAmount) }));
      const selectedId = this.data.selectedOrder && this.data.selectedOrder.enrollmentId || this._requestedEnrollmentId;
      const selectedOrder = orders.find((row) => String(row.enrollmentId) === String(selectedId)) || null;
      this._requestedEnrollmentId = null;
      this.setData({ orders,ordersReady:true,selectedOrder,...(selectedId && !selectedOrder ? { actionError:"这笔订单暂不可关联，请选择其他订单或关闭关联" } : {}) });
    } catch (error) { if (this.live(context) && seq === this._orderSeq) this.setData({ ordersError:error.message || "行程订单加载失败，请重试",ordersReady:false }); }
    finally { if (this.live(context) && seq === this._orderSeq) this.setData({ ordersLoading:false }); }
  },
  selectOrder(event) {
    if (this.data.busy || this.data.createUncertain) return;
    const order = this.data.orders.find((row) => String(row.enrollmentId) === String(event.currentTarget.dataset.id));
    if (order) this.setData({ selectedOrder:order,errors:{ ...this.data.errors,enrollmentId:"" },actionError:"" });
  },
  async submitWish() {
    if (this.data.busy || !this.requireLogin()) return;
    let intent = this._createIntent;
    if (!this.data.createUncertain || !intent) {
      const title = this.data.title.trim();
      const recipientName = this.data.linkOrder ? "" : this.data.recipientName.trim();
      const note = this.data.note.trim();
      const errors = {};
      if (!title || title.length > 40) errors.title = "写下一个心愿，最多40字";
      if (!this.data.linkOrder && recipientName.length > 20) errors.recipientName = "收礼人的称呼最多20字";
      if (note.length > 240) errors.note = "想说的话最多240字";
      if (this.data.linkOrder && (!this.data.selectedOrder || this.data.ordersError)) errors.enrollmentId = "请选择一笔真实行程订单";
      this.setData({ errors });
      if (Object.keys(errors).length) return;
      const payload = { kind:this.data.kind,title,recipientName,note,...(this.data.linkOrder ? { enrollmentId:this.data.selectedOrder.enrollmentId } : {}) };
      intent = { ...payload,idempotencyKey:newKey("wish") };
      this._createIntent = intent;
    }
    const operation = this.context();
    this._mutation = operation;
    this.setData({ busy:true,actionError:"" });
    try {
      const result = await request("/wishes","POST",intent);
      if (!this.live(operation) || this._mutation !== operation) return;
      this._createIntent = null;
      this.setData({ createUncertain:false });
      wx.redirectTo({ url:PAGE + "?token=" + encodeURIComponent(result.data.token),fail:() => {
        if (this.live(operation)) this.setData({ view:"detail",token:result.data.token,wish:decorate(result.data),ready:true,busy:false });
      } });
    } catch (error) {
      if (!this.live(operation) || this._mutation !== operation) return;
      const pending = uncertain(error);
      if (!pending) this._createIntent = null;
      this.setData({ createUncertain:pending,actionError:pending ? "上次提交结果尚未确认，请重试；同一心愿不会重复创建" : error.message || "心愿创建失败，请重试" });
    } finally { if (this.live(operation) && this._mutation === operation) { this._mutation = null; this.setData({ busy:false }); } }
  },
  async loadWish() {
    if (this.data.refreshing) return;
    const context = this.context();
    const seq = ++this._seq;
    this.setData({ refreshing:true,error:"" });
    try {
      const result = await request("/wishes/" + encodeURIComponent(this.data.token));
      if (!this.live(context) || seq !== this._seq) return;
      const wish = decorate(result.data);
      if (wish.alreadyBlessed) this._blessIntent = null;
      this.setData({ wish,ready:true,...(wish.alreadyBlessed ? { blessUncertain:false,blessing:"" } : {}) });
    } catch (error) { if (this.live(context) && seq === this._seq) this.setData({ error:error.message || "心愿暂时无法打开，请重试",ready:true }); }
    finally { if (this.live(context) && seq === this._seq) this.setData({ refreshing:false }); }
  },
  async mutate(path,method,feedback) {
    if (this.data.busy || this.data.refreshing || !this.data.wish || !this.requireLogin()) return;
    const operation = this.context();
    this._mutation = operation;
    this.setData({ busy:true,actionError:"",feedback:"" });
    try {
      const result = await request("/wishes/" + encodeURIComponent(this.data.token) + path,method,{ revision:this.data.wish.revision });
      if (!this.live(operation) || this._mutation !== operation) return;
      this.setData({ wish:decorate(result.data),feedback });
    } catch (error) {
      if (!this.live(operation) || this._mutation !== operation) return;
      this.setData({ actionError:error.status === 409 ? "心愿有了新进展，已更新，请确认后再操作" : error.message || "操作未完成，请重试" });
      await this.loadWish();
    } finally { if (this.live(operation) && this._mutation === operation) { this._mutation = null; this.setData({ busy:false }); } }
  },
  claimWish() { if (!this.requireLogin()) return; if (this.data.wish && this.data.wish.canClaim) return this.mutate("/claim","POST","你已认领，和对方约好如何安排吧"); },
  confirmAction(title,content,action) {
    if (this.data.busy || this.data.refreshing || !this.data.wish) return;
    const context = this.context();
    const revision = this.data.wish.revision;
    wx.showModal({ title,content,confirmText:"确认",success:(result) => { if (result.confirm && this.live(context) && this.data.wish && revision === this.data.wish.revision) action(); } });
  },
  releaseClaim() { if (this.data.wish && this.data.wish.canRelease) this.confirmAction("归还这份心愿？","归还后，其他朋友可以认领安排。",() => this.mutate("/claim","DELETE","心愿已归还，可由其他朋友认领")); },
  completeWish() { if (this.data.wish && this.data.wish.canComplete) this.confirmAction("已经安排好了吗？","确认你已与对方约定并安排好这份心意。此操作不会下单或付款。",() => this.mutate("/complete","POST","这份心意，已经安排好啦")); },
  closeWish() { if (this.data.wish && this.data.wish.canClose) this.confirmAction("关闭这份心愿？",this.data.wish.order ? "关闭后本页不再接受心意。不会取消原行程订单或退款，原订单的付款链接仍有效。" : "关闭后不能再认领或送祝福，已有记录会保留。",() => this.mutate("/close","POST","心愿已关闭，已有记录已保留")); },
  onBlessing(event) { if (!this.data.busy && !this.data.blessUncertain) this.setData({ blessing:event.detail.value,actionError:"" }); },
  async sendBlessing() {
    if (this.data.busy || this.data.refreshing || !this.requireLogin() || !this.data.wish || !this.data.wish.canBless) return;
    let intent = this._blessIntent;
    if (!this.data.blessUncertain || !intent) {
      const message = this.data.blessing.trim();
      if (!message || message.length > 80) { this.setData({ actionError:"写一句祝福，最多80字" }); return; }
      intent = { message,idempotencyKey:newKey("bless") };
      this._blessIntent = intent;
    }
    const operation = this.context();
    this._mutation = operation;
    this.setData({ busy:true,actionError:"",feedback:"" });
    try {
      const result = await request("/wishes/" + encodeURIComponent(this.data.token) + "/bless","POST",intent);
      if (!this.live(operation) || this._mutation !== operation) return;
      this._blessIntent = null;
      this.setData({ wish:decorate(result.data),blessing:"",blessUncertain:false,feedback:"祝福已送达，心意已留下" });
    } catch (error) {
      if (!this.live(operation) || this._mutation !== operation) return;
      const pending = uncertain(error);
      if (!pending) this._blessIntent = null;
      this.setData({ blessUncertain:pending,actionError:pending ? "祝福提交结果尚未确认，重试不会重复发送" : error.message || "祝福未送达，请重试" });
      if (error.status === 409) await this.loadWish();
    } finally { if (this.live(operation) && this._mutation === operation) { this._mutation = null; this.setData({ busy:false }); } }
  },
  async goPayment() {
    if (this.data.busy || this.data.refreshing || !this.requireLogin() || !this.data.wish || !this.data.wish.order || !this.data.wish.canPay) return;
    const operation = this.context();
    this._mutation = operation;
    this.setData({ busy:true,actionError:"" });
    try {
      const result = await request("/wishes/" + encodeURIComponent(this.data.token) + "/payment");
      if (!this.live(operation) || this._mutation !== operation) return;
      wx.navigateTo({ url:"/pages/pay/pay?token=" + encodeURIComponent(result.data.token) + "&mode=split" });
    } catch (error) {
      if (!this.live(operation) || this._mutation !== operation) return;
      this.setData({ actionError:error.message || "暂时无法支付，请重试" });
      await this.loadWish();
    } finally { if (this.live(operation) && this._mutation === operation) { this._mutation = null; this.setData({ busy:false }); } }
  },
  onShareAppMessage() {
    const wish = this.data.wish;
    return wish ? { title:wish.title,path:PAGE + "?token=" + encodeURIComponent(wish.token) } : { title:"意思意思，把小心意变成小美好",path:PAGE };
  },
});
