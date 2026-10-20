<template>
  <div class="od-page">
    <div v-if="!store.token" class="card">
      <div class="pad">
        <strong>登录后看出行计划</strong>
        <p class="muted">山野团和同城局都会出现在这里，出发前能看到集合时间和地点。</p>
        <button class="btn block" type="button" @click="goLogin()">登录查看行程</button>
      </div>
    </div>

    <template v-else>
      <div class="od-bar">
        <input v-model="keyword" class="od-search" type="search" placeholder="搜索我的订单" />
        <div class="od-tools">
          <div class="od-tabs">
            <button v-for="item in statusTabs" :key="item.key" type="button" :class="{ on: tab === item.key }" @click="tab = item.key">{{ item.label }}</button>
          </div>
          <button class="od-filter" :class="{ on: filterOn }" type="button" @click="openFilter">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5h12M4.2 8h7.6M6.5 12.5h3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /></svg>
            筛选
          </button>
        </div>
      </div>

      <article v-for="o in shown" :key="o.id" class="od-card" @click="openOrder(o)">
        <header class="od-head">
          <span class="od-shop">{{ shopOf(o) }}</span>
          <span class="od-status" :class="{ 'is-hot': hotStatus(o) }">{{ badgeOf(o).label }}</span>
        </header>
        <div class="od-goods">
          <img v-if="o.cover" :src="o.cover" alt="" />
          <span v-else class="od-ph"></span>
          <div>
            <b>{{ o.title }}</b>
            <p>{{ specOf(o) }}</p>
          </div>
          <div class="od-price">
            <b>{{ moneyOf(o) }}</b>
            <span>共1人</span>
          </div>
        </div>
        <p v-if="o.helpers?.length" class="od-help">帮忙支付 {{ o.helpers.length }} 人</p>
        <div v-if="hasActions(o)" class="od-actions" @click.stop>
          <button v-if="o.canCancel" class="od-btn" type="button" :disabled="cancelling === o.id" @click="cancel(o)">{{ o.status === "waitlist" ? "取消候补" : "取消报名" }}</button>
          <button v-if="o.canPay" class="od-btn solid" type="button" @click="goPay(o)">去支付</button>
          <button v-if="reviewable(o)" class="od-btn solid" type="button" @click="openReview(o)">去评价</button>
          <button v-if="o.canAfter && o.completed" class="od-btn" type="button" @click="goAfter(o)">评价 / 评选</button>
          <button v-if="againOf(o)" class="od-btn" :class="{ solid: !reviewable(o) }" type="button" @click="again(o)">再次报名</button>
        </div>
      </article>

      <div v-if="!list.length" class="card">
        <div class="pad">
          <strong>还没有报名</strong>
          <p class="muted">去首页报一个山野团，或去活动页约一局。</p>
          <button class="btn block" type="button" @click="$router.push('/m')">去首页</button>
          <button class="btn ghost block" type="button" style="margin-top:8px" @click="$router.push('/m/activities')">去同城局</button>
        </div>
      </div>
      <div v-else-if="!shown.length" class="card"><div class="pad muted">没有符合条件的订单。</div></div>
      <p v-else class="od-end">没有更多订单</p>
    </template>

    <div v-if="sheet" class="od-mask" @click.self="sheet = false">
      <div class="od-sheet">
        <button class="od-x" type="button" @click="sheet = false">×</button>
        <h3>订单筛选</h3>
        <p class="od-label">下单时间</p>
        <div class="od-presets">
          <button v-for="item in presetCells" :key="item.key" type="button" :class="{ on: draft.preset === item.key }" @click="pickPreset(item.key)">{{ item.label }}</button>
          <button v-if="presets.extra.length && !moreYears" type="button" @click="moreYears = true">展开</button>
        </div>
        <div class="od-range">
          <label class="od-date">
            <span>{{ draft.start || "起始时间" }}</span>
            <input v-model="draft.start" type="date" @change="draft.preset = ''" />
          </label>
          <i>—</i>
          <label class="od-date">
            <span>{{ draft.end || "终止时间" }}</span>
            <input v-model="draft.end" type="date" @change="draft.preset = ''" />
          </label>
        </div>
        <div class="od-sheet-bar">
          <button class="od-btn" type="button" @click="resetDraft">重置</button>
          <button class="od-btn solid" type="button" @click="applyFilter">确定</button>
        </div>
      </div>
    </div>
    <p v-if="msg" class="muted">{{ msg }}</p>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { deskTrips, showAfterActions, todayYmd } from "@/utils/trips";
import { canReorder, matchOrderQuery, matchOrderTime, orderBadge, orderMoney, orderShop, orderSpec, orderTimePresets } from "@/utils/orderView";

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
const tabs = new Set(["unpaid", "recruiting", "depart", "review", "waitlist", "refund", "all"]);
const statusTabs = [
  { key: "all", label: "全部" },
  { key: "unpaid", label: "待付款" },
  { key: "recruiting", label: "招募中" },
  { key: "depart", label: "待出发" },
  { key: "review", label: "待评价" },
  { key: "waitlist", label: "候补中" },
  { key: "refund", label: "已退款" },
];

function normalizeTab(raw) {
  const q = String(raw || "");
  if (q === "upcoming") return "depart";
  if (q === "past") return "all";
  return tabs.has(q) ? q : "";
}

const tab = ref(normalizeTab(pageRoute.query.tab) || "depart");
const ready = ref(false);
const presets = computed(() => orderTimePresets());
const presetCells = computed(() => presets.value.quick.concat(presets.value.years, moreYears.value ? presets.value.extra : []));
const filterOn = computed(() => Boolean(applied.value.preset || applied.value.start || applied.value.end));
const split = computed(() => deskTrips(list.value));
const pool = computed(() => {
  if (tab.value === "unpaid") return split.value.unpaid;
  if (tab.value === "recruiting") return split.value.recruiting;
  if (tab.value === "depart") return split.value.depart;
  if (tab.value === "review") return split.value.review;
  if (tab.value === "waitlist") return split.value.waitlist;
  if (tab.value === "refund") return split.value.refund;
  return list.value;
});
const shown = computed(() => pool.value.filter((row) => matchOrderTime(row, applied.value) && matchOrderQuery(row, keyword.value)));

onMounted(load);
watch(tab, () => nextTick(revealTab));
watch(
  () => String(pageRoute.query.tab || ""),
  (q) => {
    const next = normalizeTab(q);
    if (next) tab.value = next;
    else if (list.value.length) pickDefault();
  }
);

async function load() {
  if (!store.token) {
    list.value = [];
    return;
  }
  list.value = (await http.get("/orders")).data || [];
  if (!ready.value) {
    ready.value = true;
    if (normalizeTab(pageRoute.query.tab)) tab.value = normalizeTab(pageRoute.query.tab);
    else pickDefault();
  }
  nextTick(revealTab);
}
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
function reviewable(o) {
  return showAfterActions(o) && o.canReview && String(o.start_date || "").slice(0, 10) < todayYmd();
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
  draft.value = { ...applied.value };
  moreYears.value = presets.value.extra.some((item) => item.key === draft.value.preset);
  sheet.value = true;
}
function pickPreset(key) {
  draft.value = { preset: draft.value.preset === key ? "" : key, start: "", end: "" };
}
function resetDraft() {
  draft.value = { preset: "", start: "", end: "" };
}
function applyFilter() {
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
    msg.value = "已取消报名";
  } catch (e) {
    msg.value = e.message || "取消失败";
  } finally {
    cancelling.value = 0;
  }
}
</script>
