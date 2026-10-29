<template>
  <div class="od-page">
    <header class="journey-hero">
      <div class="journey-eyebrow">EVERY JOURNEY MATTERS</div>
      <h1>我的每一程</h1><p>期待下一次出发，也珍藏每一次同行。</p>
      <svg class="journey-hero-art" viewBox="0 0 100 100" fill="none" aria-hidden="true"><circle cx="51" cy="48" r="39"/><path d="m15 68 27-34 23 27 11-13 16 20M42 34l8 20 8-4M21 76h64M63 24h17m-8-8v16"/></svg>
      <div v-if="store.token" class="journey-summary" data-testid="journey-summary"><button v-for="item in summary" :key="item.key" type="button" @click="selectTab(item.key)"><strong>{{ ready ? item.count : '—' }}</strong><span>{{ item.label }}<i aria-hidden="true">↗</i></span></button></div>
    </header>
    <section v-if="!store.token" class="journey-empty"><span class="journey-empty-mark" aria-hidden="true">↗</span><h2>登录后看出行计划</h2><p>山野团和同城局都会出现在这里，出发前能看到集合时间和地点。</p><button class="od-btn solid" type="button" @click="goLogin()">登录查看行程</button></section>
    <template v-else>
      <div class="od-bar">
        <label class="journey-search"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="m12 12 5 5"/></svg><input v-model="keyword" class="od-search" type="search" placeholder="搜索行程、地点或出行人" aria-label="搜索我的行程" /></label>
        <div class="od-tools"><div class="od-tabs" role="tablist" aria-label="行程状态"><button v-for="item in statusTabs" :key="item.key" :data-testid="'order-tab-' + item.key" type="button" role="tab" :aria-selected="tab === item.key" :class="{ on: tab === item.key }" @click="selectTab(item.key)">{{ item.label }}<small v-if="ready && tabCount(item.key)">{{ tabCount(item.key) }}</small></button></div><button class="od-filter" :class="{ on: filterOn || !primaryKeys.includes(tab) }" type="button" @click="openFilter"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14"/><circle cx="7" cy="5" r="2"/><circle cx="13" cy="10" r="2"/><circle cx="7" cy="15" r="2"/></svg><span>筛选</span></button></div>
      </div>
      <div class="journey-result"><span>{{ selectedStatus }}<i>·</i>{{ shown.length }} 项行程</span><button v-if="keyword || filterOn" type="button" @click="clearFilters">清空筛选 ×</button></div>
      <div v-if="loadError" class="journey-error" role="alert"><div><strong>行程加载失败</strong><p>{{ list.length ? '已保留上次的行程，请重试更新。' : '暂时无法获取行程，请稍后重试。' }}</p></div><button class="od-btn" type="button" :disabled="loading" @click="load">重新加载</button></div>
      <div class="journey-list">
      <article v-for="o in shown" :key="o.id" class="od-card" data-testid="order-card">
        <button class="journey-card-main" type="button" @click="openOrder(o)">
          <header class="od-head"><span class="od-shop"><i aria-hidden="true"></i>{{ shopOf(o) }}</span><span class="od-status" :class="{ 'is-hot': hotStatus(o), 'is-ended': split.ended.some(item => item.id === o.id) }">{{ badgeOf(o).label }}</span></header>
          <div class="od-goods"><img v-if="o.cover" :src="o.cover" alt="" loading="lazy" @error="o.cover = ''"/><span v-else class="od-ph"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="m4 30 13-19 13 19M25 23l6-9 6 16M13 17l5 6 4-3"/></svg></span><div class="od-main"><b>{{ o.title }}</b><p>{{ hintOf(o) }}</p><span class="journey-view">查看行程详情 <i aria-hidden="true">↗</i></span></div></div>
          <div class="journey-arrangement"><p><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="3.5" width="12" height="10.5" rx="2"/><path d="M5 2v3m6-3v3M2 7h12"/></svg><strong>{{ travelDate(o) }}</strong><span>{{ travelTime(o) }}</span></p><p><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 6.5C13 10 8 14 8 14S3 10 3 6.5a5 5 0 1 1 10 0Z"/><circle cx="8" cy="6.5" r="1.5"/></svg><span>{{ travelPlace(o) }}</span></p></div>
        </button>
        <div class="journey-card-foot"><p class="journey-payment"><span>{{ paymentLabel(o) }}</span><strong>{{ moneyOf(o) }}</strong></p><p v-if="o.helpers?.length" class="od-help">帮忙支付 {{ o.helpers.length }} 人</p></div>
        <div v-if="hasActions(o)" class="od-actions"><button v-if="o.canCancel" class="od-btn" type="button" :disabled="cancelling === o.id" @click="cancel(o)">{{ cancelling === o.id ? '取消中…' : o.status === 'waitlist' ? '取消候补' : '取消报名' }}</button><button v-if="o.canPay" class="od-btn solid" type="button" @click="goPay(o)">去支付</button><button v-if="reviewable(o)" class="od-btn solid" type="button" @click="openReview(o)">去评价</button><button v-if="o.canAfter && o.completed" class="od-btn" type="button" @click="goAfter(o)">评价 / 评选</button><button v-if="againOf(o)" class="od-btn" :class="{ solid: !reviewable(o) && !o.canPay }" type="button" @click="again(o)">再次报名</button></div>
      </article></div>
      <LoadRow v-if="loading" />
      <section v-else-if="!loadError && !list.length" class="journey-empty"><span class="journey-empty-mark" aria-hidden="true">↗</span><h2>下一程，等你出发</h2><p>去发现一条心动的线路，或参加一场有趣的同城活动。</p><button class="od-btn solid" type="button" @click="$router.push('/m')">发现山野线路</button><button class="od-btn" type="button" @click="$router.push('/m/activities')">看看同城活动</button></section>
      <section v-else-if="!loadError && !shown.length" class="journey-empty"><h2>{{ tab === 'ended' ? '好风景，留在未来的回忆里' : '这里暂时没有行程' }}</h2><p>{{ tab === 'ended' ? '已参加并结束的行程会收在这里。取消报名和退款记录可在其他状态中查看。' : '试试其他状态，或调整搜索与时间条件。' }}</p><button class="od-btn" type="button" @click="clearFilters">查看全部行程</button></section><p v-else-if="shown.length && !loading" class="od-end">每一次同行，都有值得记住的风景</p>
    </template>
    <div v-if="sheet" class="od-mask" @click.self="sheet = false"><section class="od-sheet" role="dialog" aria-modal="true" aria-labelledby="journey-filter-title"><button class="od-x" type="button" aria-label="关闭筛选" @click="sheet = false">×</button><span class="journey-eyebrow">FIND YOUR JOURNEY</span><h3 id="journey-filter-title">行程筛选</h3><p class="od-label">行程状态</p><div class="od-presets journey-status-options"><button v-for="item in allStatusTabs" :key="item.key" type="button" :aria-pressed="draftTab === item.key" :class="{on:draftTab === item.key}" @click="draftTab=item.key">{{ item.label }}</button></div><p class="od-label">报名时间</p><div class="od-presets"><button v-for="item in presetCells" :key="item.key" type="button" :class="{on:draft.preset === item.key}" @click="pickPreset(item.key)">{{ item.label }}</button><button v-if="presets.extra.length && !moreYears" type="button" @click="moreYears=true">展开</button></div><div class="od-range"><label class="od-date"><span>{{ draft.start || '起始时间' }}</span><input v-model="draft.start" type="date" aria-label="起始时间" @change="draft.preset = ''; filterError = ''"/></label><i>—</i><label class="od-date"><span>{{ draft.end || '终止时间' }}</span><input v-model="draft.end" type="date" aria-label="终止时间" @change="draft.preset = ''; filterError = ''"/></label></div><p v-if="filterError" class="journey-filter-error" role="alert">{{ filterError }}</p><div class="od-sheet-bar"><button class="od-btn" type="button" @click="resetDraft">重置</button><button class="od-btn solid" type="button" @click="applyFilter">确定</button></div></section></div><p v-if="msg" class="journey-feedback" role="status">{{ msg }}</p>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { deskTrips, isReviewTrip, normalizeTripTab, tripEndDay } from "@/utils/trips";
import LoadRow from "@/components/LoadRow.vue";
import { canReorder, matchOrderQuery, matchOrderTime, orderBadge, orderHint, orderMoney, orderShop, orderSpec, orderTimePresets } from "@/utils/orderView";

const store = useUserStore();
const router = useRouter();
const pageRoute = useRoute();
const list = ref([]);
const msg = ref("");
const cancelling = ref(0);
const keyword = ref("");
const sheet = ref(false);
const moreYears = ref(false);
const applied = ref({ preset: "", start: "", end: "" });
const draft = ref({ preset: "", start: "", end: "" });
const allStatusTabs = [
  { key: "all", label: "全部" },
  { key: "unpaid", label: "待付款" },
  { key: "recruiting", label: "招募中" },
  { key: "depart", label: "待出发" },
  { key: "review", label: "待评价" },
  { key: "waitlist", label: "候补中" },
  { key: "refund", label: "已退款" },
  { key: "ended", label: "已结束" },
];

const normalizeTab = normalizeTripTab;

const tab = ref(normalizeTab(pageRoute.query.tab) || "depart");
const ready = ref(false);
const loadError = ref(false);
const filterError = ref("");
const draftTab = ref("");
let pendingLoad;
let disposed = false;
const loading = ref(true);
const presets = computed(() => orderTimePresets());
const presetCells = computed(() => presets.value.quick.concat(presets.value.years, moreYears.value ? presets.value.extra : []));
const filterOn = computed(() => Boolean(applied.value.preset || applied.value.start || applied.value.end));
const split = computed(() => deskTrips(list.value));
const primaryKeys = ["all", "depart", "unpaid", "review", "ended"];
const statusTabs = computed(() => [...primaryKeys, ...(!primaryKeys.includes(tab.value) ? [tab.value] : [])].map((key) => allStatusTabs.find((item) => item.key === key)).filter(Boolean));
const selectedStatus = computed(() => allStatusTabs.find((item) => item.key === tab.value)?.label || "全部");
const summary = computed(() => [{ key:"depart", label:"待出发", count:split.value.depart.length }, { key:"unpaid", label:"待付款", count:split.value.unpaid.length }, { key:"ended", label:"已结束", count:split.value.ended.length }]);
const pool = computed(() => {
  if (tab.value === "unpaid") return split.value.unpaid;
  if (tab.value === "recruiting") return split.value.recruiting;
  if (tab.value === "depart") return split.value.depart;
  if (tab.value === "review") return split.value.review;
  if (tab.value === "waitlist") return split.value.waitlist;
  if (tab.value === "refund") return split.value.refund;
  if (tab.value === "ended") return split.value.ended;
  return list.value;
});
const shown = computed(() => pool.value.filter((row) => matchOrderTime(row, applied.value) && matchOrderQuery(row, keyword.value)));

onMounted(load);
onUnmounted(() => { disposed = true; });
watch(tab, () => nextTick(revealTab));
watch(
  () => String(pageRoute.query.tab || ""),
  (q) => {
    const next = normalizeTab(q);
    if (next) tab.value = next;
    else if (list.value.length) pickDefault();
  }
);

function load() {
  if (pendingLoad) return pendingLoad;
  if (!store.token) { list.value = []; loading.value = false; return Promise.resolve(); }
  loading.value = true;
  loadError.value = false;
  pendingLoad = http.get("/orders").then((response) => {
    if (disposed) return;
    if (!Array.isArray(response.data)) throw new Error("Invalid orders");
    list.value = response.data;
    if (!ready.value) {
      ready.value = true;
      if (normalizeTab(pageRoute.query.tab)) tab.value = normalizeTab(pageRoute.query.tab);
      else pickDefault();
    }
    nextTick(revealTab);
  }).catch(() => { if (!disposed) loadError.value = true; })
    .finally(() => { if (!disposed) loading.value = false; pendingLoad = null; });
  return pendingLoad;
}
function selectTab(key) {
  const next = normalizeTab(key);
  if (!next) return;
  tab.value = next;
  router.replace({ query: { ...pageRoute.query, tab: next } });
}
function clearFilters() { keyword.value = ""; applied.value = { preset:"", start:"", end:"" }; selectTab("all"); }
function tabCount(key) { return key === "all" ? list.value.length : (split.value[key] || []).length; }
function travelDate(o) {
  const start = String(o.start_date || o.startDate || "").slice(0,10);
  const end = tripEndDay(o);
  return start ? start.replace(/-/g,".") + (end && end !== start ? " — " + end.replace(/-/g,".") : "") : "日期待确认";
}
function travelTime(o) { return o.meetup_time || o.meetupTime || "时间待确认"; }
function travelPlace(o) { return o.meetup_point || o.meetupPoint || o.city || "集合地点待确认"; }
function paymentLabel(o) { return o.pay_status === "unpaid" ? "待支付" : o.pay_status === "company_pending" ? "公司统一支付" : Number(o.payAmount ?? o.pay_amount ?? 0) === 0 ? "参与费用" : "报名费用"; }

function revealTab() {
  const scroller = document.querySelector(".od-tabs");
  const el = scroller?.querySelector("button.on");
  if (!scroller || !el) return;
  const left = el.offsetLeft - (scroller.clientWidth - el.offsetWidth) / 2;
  scroller.scrollTo({ left: Math.max(0, left) });
}
function pickDefault() {
  const desk = deskTrips(list.value);
  if (desk.depart.length) tab.value = "depart";
  else if (desk.unpaid.length) tab.value = "unpaid";
  else if (desk.recruiting.length) tab.value = "recruiting";
  else if (desk.review.length) tab.value = "review";
  else if (desk.waitlist.length) tab.value = "waitlist";
  else if (desk.refund.length) tab.value = "refund";
  else tab.value = "all";
}
function reviewable(o) { return isReviewTrip(o); }

function hintOf(o) {
  if (["refund", "recruiting", "overdue"].includes(orderBadge(o).key)) return orderHint(o);
  return o.channel === "activity" ? "同城相遇，一起赴约" : "走进山野，和同频的人同行";
}

function badgeOf(o) {
  return orderBadge(o);
}
function shopOf(o) {
  return orderShop(o);
}
function specOf(o) {
  return orderSpec(o);
}
function moneyOf(o) {
  return orderMoney(o);
}
function hotStatus(o) {
  const key = orderBadge(o).key;
  return key === "unpaid";
}
function againOf(o) {
  return canReorder(o);
}
function hasActions(o) {
  return o.canCancel || o.canPay || reviewable(o) || (o.canAfter && o.completed) || canReorder(o);
}
function goLogin() {
  router.push({ path: "/m/login", query: { redirect: "/m/orders" } });
}
function openOrder(o) {
  router.push("/m/orders/" + o.id);
}
function openReview(o) {
  router.push({ path: "/m/orders/" + o.id, query: { review: "1" } });
}
function goAfter(o) {
  router.push("/m/after/" + o.schedule_id);
}
function again(o) {
  if (o.route_id) router.push("/m/route/" + o.route_id);
}
function goPay(o) {
  if (o.payShareToken) router.push("/m/pay/" + o.payShareToken);
  else openOrder(o);
}
function openFilter() {
  filterError.value = "";
  draftTab.value = tab.value;
  draft.value = { ...applied.value };
  moreYears.value = presets.value.extra.some((item) => item.key === draft.value.preset);
  sheet.value = true;
}
function pickPreset(key) {
  draft.value = { preset: draft.value.preset === key ? "" : key, start: "", end: "" };
}
function resetDraft() {
  filterError.value = "";
  draftTab.value = "all";
  draft.value = { preset: "", start: "", end: "" };
}
function applyFilter() {
  if (draft.value.start && draft.value.end && draft.value.start > draft.value.end) { filterError.value = "起始时间不能晚于终止时间"; return; }
  filterError.value = "";
  selectTab(draftTab.value);
  applied.value = { ...draft.value };
  sheet.value = false;
}
function cancelMessage(o) {
  const deduct = Number(o && o.deductAmount) || 0;
  if (deduct > 0) {
    return `临近出发，取消将扣除 ${o.deductPercent}%（¥${deduct}），退回 ¥${Number(o.refundAmount) || 0}。确定取消报名？名额将释放给其他人。`;
  }
  if (o && o.refundHint) return `确定取消报名？${o.refundHint}。名额将释放给其他人。已付款按付款人原路退回。`;
  return "确定取消报名？名额将释放给其他人。已付款按付款人原路退回。";
}
async function cancel(o) {
  if (!window.confirm(cancelMessage(o))) return;
  cancelling.value = o.id;
  msg.value = "";
  try {
    await http.post(`/orders/${o.id}/cancel`);
    await load();
    msg.value = loadError.value ? "已取消报名，请重新加载行程" : "已取消报名";
  } catch (e) {
    msg.value = e.message || "取消失败";
  } finally {
    cancelling.value = 0;
  }
}
</script>

<style scoped>
.od-page { --jo-purple:#5b3b8c; --jo-ink:#2d2834; --jo-muted:#887d94; --jo-paper:#fff; --jo-soft:#f3eef8; --jo-line:#eae4f0; padding:4px 0 24px; color:var(--jo-ink); overflow-wrap:anywhere; }
.od-page *, .od-page *::before, .od-page *::after { box-sizing:border-box; }
.od-page button,.od-page input { font:inherit; }
.od-page svg { stroke:currentColor; stroke-width:1.35; stroke-linecap:round; stroke-linejoin:round; flex:none; }
.od-page button { cursor:pointer; -webkit-tap-highlight-color:transparent; }
.od-page button:focus-visible,.od-page input:focus-visible { outline:2px solid #9d7dbd; outline-offset:3px; }
.od-page strong,.od-page b { background:transparent; color:inherit; }
.journey-hero { position:relative; overflow:hidden; padding:20px 21px 0; margin:0 0 20px; border:1px solid #e3d8ee; border-radius:22px; background:linear-gradient(120deg,#eee6f7,#f8f5fb); }
.journey-eyebrow { color:#a38ab8; font-size:9px; letter-spacing:.15em; line-height:1.8; }
.journey-hero h1 { position:relative; z-index:1; margin:8px 0 5px; font-size:calc(27px * var(--ui-scale,1)); font-weight:600; letter-spacing:.02em; color:var(--jo-purple); line-height:1.45; }
.journey-hero > p { position:relative; z-index:1; max-width:80%; margin:0 0 18px; color:#89759e; font-size:calc(11px * var(--ui-scale,1)); line-height:1.8; }
.journey-hero-art { position:absolute; width:115px; height:115px; top:8px; right:-12px; color:#c6b0dc; opacity:.5; }
.journey-summary { position:relative; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); padding:13px 0; border-top:1px solid #dfd2eb; }
.journey-summary button { min-width:0; padding:0 10px; border:0; border-right:1px solid #e1d7ec; border-radius:0; background:transparent; color:var(--jo-purple); text-align:left; }
.journey-summary button:first-child { padding-left:0; }.journey-summary button:last-child { border-right:0; }
.journey-summary strong { display:block; color:inherit; font-size:calc(23px * var(--ui-scale,1)); line-height:1.2; font-weight:500; }
.journey-summary span { display:flex; justify-content:space-between; gap:5px; margin-top:7px; color:#8a779c; font-size:calc(11px * var(--ui-scale,1)); line-height:1.5; }.journey-summary i { font-style:normal; opacity:.6; }
.od-page .od-bar { position:static; margin:0; padding:0; border-radius:0; background:transparent; }
.journey-search { display:flex; align-items:center; gap:10px; width:100%; padding:0 14px; border:1px solid var(--jo-line); border-radius:12px; background:var(--jo-paper); }
.journey-search svg { width:18px; height:18px; color:#a18caf; }
.od-page .od-search { min-width:0; flex:1; width:100%; margin:0; padding:13px 0; background:transparent; border:0; border-radius:0; box-shadow:none; color:var(--jo-ink); font-size:calc(12px * var(--ui-scale,1)); outline:none; }
.od-page .od-search::placeholder { color:#94889f; }
.od-page .od-tools { display:flex; align-items:center; gap:10px; padding:13px 0 0; }
.od-page .od-tabs { display:flex; flex:1; min-width:0; gap:20px; overflow-x:auto; border-bottom:0; scrollbar-width:none; white-space:nowrap; padding:0; }
.od-page .od-tabs button { flex:none; position:relative; display:flex; align-items:center; gap:4px; min-height:40px; padding:7px 0 13px; margin:0; border:0; border-radius:0; background:transparent; box-shadow:none; color:var(--jo-muted); font-size:calc(12px * var(--ui-scale,1)); line-height:1.5; font-weight:400; }
.od-page .od-tabs button small { color:#b0a2bb; font-size:calc(9px * var(--ui-scale,1)); }.od-page .od-tabs button.on { color:var(--jo-purple); font-weight:600; box-shadow:none; }.od-page .od-tabs button.on::after { content:''; position:absolute; height:3px; width:15px; bottom:4px; left:calc(50% - 7.5px); border-radius:5px; background:var(--jo-purple); }
.od-page .od-filter { display:flex; flex:none; gap:4px; align-items:center; padding:0 0 7px 9px; min-height:38px; border:0; border-left:1px solid var(--jo-line); border-radius:0; background:transparent; color:var(--jo-muted); font-size:calc(10px * var(--ui-scale,1)); }.od-page .od-filter svg { width:17px; height:17px; }.od-page .od-filter.on { color:var(--jo-purple); }
.journey-result { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 2px; color:#9c8daa; font-size:calc(10px * var(--ui-scale,1)); }.journey-result i { margin:0 6px; font-style:normal; }.journey-result button { background:transparent; border:0; color:var(--jo-purple); padding:0; }
.journey-list { display:grid; grid-template-columns:minmax(0,1fr); gap:15px; }
.od-page .od-card { width:100%; max-width:none; margin:0; border:1px solid var(--jo-line); border-radius:18px; overflow:hidden; background:var(--jo-paper); box-shadow:0 5px 14px #69488404; }
.journey-card-main { display:block; width:100%; padding:0; text-align:left; border:0; border-radius:0; color:var(--jo-ink); background:transparent; }
.od-page .od-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 16px 13px; }.od-page .od-shop { display:flex; align-items:center; min-width:0; gap:7px; font-size:calc(11px * var(--ui-scale,1)); color:#776384; font-weight:500; }.od-shop i { width:5px; height:5px; background:#b49ac8; border-radius:50%; flex:none; }
.od-page .od-status { flex:none; max-width:55%; padding:3px 6px; border-radius:5px; background:var(--jo-soft); color:var(--jo-purple); font-size:calc(10px * var(--ui-scale,1)); font-weight:400; }.od-page .od-status.is-hot { color:#b1744f; background:#faf0e8; }.od-page .od-status.is-ended { color:#859084; background:#edf2ed; }
.od-page .od-goods { display:flex; align-items:stretch; gap:13px; padding:0 16px; }.od-page .od-goods img,.od-page .od-ph { flex:none; width:90px; height:96px; border-radius:10px; object-fit:cover; background:var(--jo-soft); }.od-page .od-ph { display:grid; place-items:center; color:#b9a3ca; }.od-ph svg { width:46px; height:46px; }
.od-main { flex:1; min-width:0; }.od-page .od-goods b { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin:0; color:var(--jo-ink); font-size:calc(15px * var(--ui-scale,1)); font-weight:600; line-height:1.55; }.od-page .od-goods p { display:block; margin:7px 0 0; color:#9d90a8; font-size:calc(10px * var(--ui-scale,1)); line-height:1.6; white-space:normal; }.journey-view { display:flex; align-items:center; gap:7px; margin-top:11px; color:#9e87b0; font-size:calc(10px * var(--ui-scale,1)); }.journey-view i { font-style:normal; font-size:15px; }
.journey-arrangement { margin:14px 16px 0; padding:12px 0 13px; border-bottom:1px dashed var(--jo-line); }.journey-arrangement p { display:flex; flex-wrap:wrap; align-items:flex-start; gap:6px; margin:0; color:var(--jo-muted); font-size:calc(11px * var(--ui-scale,1)); line-height:1.7; }.journey-arrangement p + p { margin-top:6px; }.journey-arrangement svg { width:14px; height:14px; margin-top:2px; color:#a48eb5; }.journey-arrangement strong { color:#6d557f; font-weight:500; }.journey-arrangement p > span { min-width:0; }
.journey-card-foot { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; padding:12px 16px 0; }.journey-payment { display:flex; align-items:baseline; flex-wrap:wrap; gap:9px; margin:0; }.journey-payment > span { color:var(--jo-muted); font-size:calc(10px * var(--ui-scale,1)); }.journey-payment > strong { color:var(--jo-ink); font-size:calc(16px * var(--ui-scale,1)); font-weight:500; }.od-page .od-help { padding:0; margin:0; color:#ab9db4; font-size:calc(9px * var(--ui-scale,1)); }
.od-page .od-actions { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px; padding:12px 16px 16px; }.od-page .od-card:not(:has(.od-actions)) .journey-card-foot { padding-bottom:16px; }
.od-page .od-btn { display:inline-flex; justify-content:center; align-items:center; min-height:35px; padding:7px 14px; border:1px solid var(--jo-line); border-radius:20px; color:#8d7c9b; background:var(--jo-paper); font-size:calc(11px * var(--ui-scale,1)); line-height:1.5; text-align:center; }.od-page .od-btn.solid { color:var(--jo-purple); border-color:#e4d8ee; background:var(--jo-soft); }.od-page .od-btn:disabled { opacity:.5; cursor:wait; }
.journey-empty { margin:0; padding:30px 23px; border:1px solid var(--jo-line); border-radius:18px; background:var(--jo-paper); text-align:center; }.journey-empty-mark { display:grid; place-items:center; width:58px; height:58px; margin:0 auto 17px; color:#b29ac7; border:1px solid #e5daef; border-radius:50%; font-size:26px; }.journey-empty h2 { font-size:calc(17px * var(--ui-scale,1)); font-weight:500; line-height:1.6; margin:0; }.journey-empty p { max-width:360px; margin:10px auto 18px; color:var(--jo-muted); font-size:calc(12px * var(--ui-scale,1)); line-height:1.8; }.journey-empty .od-btn { margin:3px; }.od-page .od-end { padding:24px 0 0; margin:0; color:#b0a0bb; font-size:calc(10px * var(--ui-scale,1)); line-height:1.6; }
.journey-error { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; padding:15px; margin-bottom:15px; border:1px solid var(--jo-line); border-radius:13px; background:var(--jo-paper); }.journey-error strong { font-size:calc(13px * var(--ui-scale,1)); font-weight:500; }.journey-error p { margin:5px 0 0; color:var(--jo-muted); font-size:calc(11px * var(--ui-scale,1)); }.journey-feedback { padding:14px; margin-top:15px; border-radius:10px; background:var(--jo-soft); color:var(--jo-purple); font-size:calc(12px * var(--ui-scale,1)); }
.od-page .od-mask { z-index:55; position:fixed; inset:0; display:flex; justify-content:center; align-items:flex-end; background:#1e122b66; }.od-page .od-sheet { position:relative; width:100%; max-width:560px; max-height:85dvh; overflow-y:auto; margin:0; padding:24px 23px max(24px,env(safe-area-inset-bottom)); border:1px solid var(--jo-line); border-radius:24px 24px 0 0; background:var(--jo-paper); color:var(--jo-ink); }.od-page .od-sheet h3 { text-align:left; font-size:calc(22px * var(--ui-scale,1)); font-weight:500; margin:5px 0 24px; }.od-page .od-x { position:absolute; top:15px; right:20px; padding:4px; border:0; background:transparent; color:var(--jo-muted); font-size:25px; }.od-page .od-label { margin:20px 0 11px; font-size:calc(12px * var(--ui-scale,1)); font-weight:500; }.od-page .od-presets { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:9px; }.od-page .od-presets button { width:auto; min-width:0; padding:10px 5px; border:1px solid var(--jo-line); border-radius:9px; background:var(--jo-paper); color:var(--jo-muted); font-size:calc(11px * var(--ui-scale,1)); line-height:1.5; }.od-page .od-presets button.on { border-color:#c5addc; background:var(--jo-soft); color:var(--jo-purple); box-shadow:none; }.od-page .od-range { display:flex; gap:8px; align-items:center; margin-top:13px; }.od-page .od-range i { font-style:normal; color:#ad9dba; }.od-page .od-date { width:auto; min-width:0; flex:1; padding:11px 5px; background:var(--jo-soft); color:var(--jo-muted); border:1px solid var(--jo-line); border-radius:9px; font-size:calc(11px * var(--ui-scale,1)); }.od-page .od-date input { width:100%; height:100%; position:absolute; inset:0; opacity:0; cursor:pointer; }.od-page .od-sheet-bar { display:flex; gap:10px; margin-top:25px; }.od-page .od-sheet-bar .od-btn { flex:1; padding:10px 0; font-size:calc(13px * var(--ui-scale,1)); }.od-page .od-sheet-bar .od-btn.solid { background:var(--jo-purple); color:var(--jo-paper); border-color:var(--jo-purple); }.journey-filter-error { color:#ad6352; font-size:calc(11px * var(--ui-scale,1)); line-height:1.7; margin:10px 0 0; }
:global(html[data-night="dark"] .od-page) { --jo-purple:#d2b5ef; --jo-ink:#eee7f5; --jo-muted:#b3a4c0; --jo-paper:#211c2a; --jo-soft:#30263d; --jo-line:#3c3047; }
:global(html[data-night="dark"] .od-page .journey-hero) { background:linear-gradient(120deg,#30233f,#231c2f); border-color:#493555; }:global(html[data-night="dark"] .od-page .journey-summary) { border-color:#4b3959; }:global(html[data-night="dark"] .od-page .journey-summary button) { border-color:#4b3959; }
:global(html[data-night="dark"] .od-page .journey-summary span),:global(html[data-night="dark"] .od-page .journey-hero > p),:global(html[data-night="dark"] .od-page .od-shop),:global(html[data-night="dark"] .od-page .journey-arrangement strong) { color:#bca3cf; }
:global(html[data-night="dark"] .mp-phone.is-orders .od-page .journey-summary strong) { background:transparent; color:#d2b5ef; }
:global(html[data-night="dark"] .mp-phone.is-orders .od-page .od-btn.solid) { background:var(--jo-soft); color:var(--jo-purple); border-color:var(--jo-line); }
:global(html[data-night="dark"] .mp-phone.is-orders .od-page .od-sheet-bar .od-btn.solid) { background:var(--jo-purple); color:var(--jo-paper); border-color:var(--jo-purple); }
:global(html[data-night="dark"] .od-page .od-status.is-hot) { background:#423024; color:#d4af8d; }:global(html[data-night="dark"] .od-page .od-status.is-ended) { background:#29372f; color:#afc5b0; }
:global(html[data-text="1"] .od-page .od-goods img),:global(html[data-text="1"] .od-page .od-ph),:global(html[data-text="1"] .od-page .journey-hero-art) { display:none; }
@media(max-width:360px) { .journey-hero { padding-inline:17px; }.journey-hero > p { max-width:100%; }.journey-hero-art { opacity:.2; }.journey-summary button { padding-inline:8px; }.od-page .od-tabs { gap:17px; }.od-page .od-goods { gap:11px; }.od-page .od-goods img,.od-page .od-ph { width:73px; height:90px; }.od-page .od-presets { gap:7px; }.od-page .od-card .od-head { align-items:flex-start; }.journey-card-foot { align-items:flex-start; } }
@media(min-width:700px) { .od-page { max-width:1040px; margin:auto; padding:10px 16px 32px; }.journey-hero { padding:28px 30px 0; }.journey-hero h1 { font-size:calc(33px * var(--ui-scale,1)); }.journey-hero > p { font-size:calc(13px * var(--ui-scale,1)); }.journey-hero-art { width:175px; height:175px; right:50px; top:-6px; }.journey-summary { max-width:560px; padding:20px 0; }.journey-list { grid-template-columns:repeat(2,minmax(0,1fr)); }.od-page .od-tabs { gap:29px; }.od-page .od-card { display:flex; flex-direction:column; }.journey-card-main { flex:1; }.od-page .od-sheet { border-radius:24px; margin:30px; }.od-page .od-mask { align-items:center; } }
</style>
