<template>
  <LoadRow v-if="!ready" />
  <div v-else-if="order" class="order-detail">
    <header class="ed-status" :class="'state-' + badge.key"><span class="ed-state-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><template v-if="['unpaid','waitlist','applied','recruiting','overdue'].includes(badge.key)"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></template><path v-else d="m6 12 4 4 8-8"/></svg></span><div><p class="ed-eyebrow">{{ t(activity ? '同城活动报名' : '出行订单') }}</p><h1>{{ t(badge.label) }}</h1><p class="ed-status-hint">{{ t(hint) }}</p></div></header>
    <section class="ed-card ed-event"><div class="ed-section-head"><span class="ed-tag">{{ t(shop) }}</span><button type="button" class="ed-link" @click="goSchedule">{{ t(activity ? '本场活动' : '本次团期') }} <span aria-hidden="true">›</span></button></div><button class="ed-event-main" type="button" @click="goSchedule"><img v-if="order.cover" :src="order.cover" alt="" @error="order.cover = ''"/><span v-else class="ed-placeholder" :data-kind="icon"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path :d="iconPaths[icon]"/></svg></span><span class="ed-event-title"><strong>{{ t(order.title) }}</strong><small>{{ t(activity ? '一场相遇，一起赴约' : '这一程，与同频的人同行') }}</small></span></button><dl class="ed-arrangement"><div><dt>{{ t(activity ? '活动时间' : '出发时间') }}</dt><dd>{{ date || t('时间待确认') }}</dd></div><div><dt>{{ t(activity ? '活动地点' : '集合地点') }}</dt><dd>{{ t(place) }}</dd></div><div v-if="!activity && order.seat_no"><dt>{{ t('座位') }}</dt><dd>{{ order.seat_no }}</dd></div></dl></section>
    <section class="ed-card ed-person"><h2>{{ t(activity ? '参与人' : '出行人') }}<small>{{ t('共1人') }}</small></h2><div class="ed-person-row"><span class="ed-person-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/></svg></span><div><strong>{{ t(order.traveler_name || '出行人') }}</strong><small v-if="phone">{{ phone }}</small></div></div></section>
    <section class="ed-card ed-fees"><h2>{{ t('费用明细') }}</h2><dl><div v-for="line in prices.lines" :key="line.label"><dt>{{ t(line.label) }}</dt><dd>{{ line.value > 0 ? '¥' + line.value : t('免费') }}</dd></div><div v-if="order.paidAmount > 0 && order.canPay"><dt>{{ t('已支付') }}</dt><dd>¥{{ order.paidAmount }}</dd></div></dl><div class="ed-total"><span>{{ t(amountLabel) }}</span><strong>{{ amount > 0 ? "¥" + amount : t("免费") }}</strong></div><p v-if="order.helpers?.length" class="ed-helper">{{ t('帮忙支付') }} · {{ order.helpers.map(row => row.nickname).filter(Boolean).join('、') }}</p></section>
    <button v-if="wishEnrollmentId || order.wishToken" type="button" class="od-wish-entry" @click="goWish"><span class="od-wish-icon" aria-hidden="true"><WishGlyph kind="other" /></span><span><strong>{{ t(order.wishToken ? '这一程的心意，收在这里' : '把这一程，写进心愿') }}</strong><small>{{ t(order.wishToken ? '查看心愿与朋友留下的心意' : '邀请朋友，为真实行程出一份心意') }}</small></span><span class="od-wish-arrow" aria-hidden="true">›</span></button>
    <section class="ed-card ed-info"><h2>{{ t('订单信息') }}</h2><dl><div><dt>{{ t('订单编号') }}</dt><dd class="ed-order-no"><span>{{ no }}</span><button type="button" @click="copyNo">{{ t('复制') }}</button></dd></div><div v-if="placed"><dt>{{ t('下单时间') }}</dt><dd>{{ placed }}</dd></div><div><dt>{{ t('支付方式') }}</dt><dd>{{ t(payMethod) }}</dd></div></dl></section>
    <section v-if="reviewOpen" class="ed-card ed-review"><h2>{{ t('记录这次同行') }}</h2><div class="ed-stars"><button v-for="n in 5" :key="n" type="button" :class="{on:form.rating >= n}" :aria-label="String(n)" @click="form.rating = n">★</button></div><textarea v-model="form.content" rows="3" :placeholder="t('这次出行怎么样（选填）')"/><button class="ed-button primary" type="button" :disabled="submitting" @click="submitReview">{{ t(submitting ? '提交中…' : '提交评价') }}</button></section>
    <p v-if="!hasActions && !reviewOpen" class="ed-record-note">{{ t('报名记录已为你保存') }}</p>
    <div v-if="hasActions" class="ed-dock"><div class="ed-dock-content"><div v-if="order.canPay" class="ed-dock-price"><small>{{ t('待支付') }}</small><strong>{{ amount > 0 ? "¥" + amount : t("免费") }}</strong></div><div class="ed-dock-actions"><button v-if="order.canCancel" class="ed-button" type="button" :disabled="cancelling" @click="cancel">{{ t(cancelling ? '取消中…' : order.status === 'waitlist' ? '取消候补' : '取消报名') }}</button><button v-if="order.canPay" class="ed-button primary" type="button" @click="goPay">{{ t('去支付') }}</button><button v-if="canReview && !reviewOpen" class="ed-button primary" type="button" @click="reviewOpen = true">{{ t('去评价') }}</button><button v-if="order.canAfter && order.completed" class="ed-button" type="button" @click="$router.push('/m/after/' + order.schedule_id)">{{ t('评价 / 评选') }}</button><button v-if="again" class="ed-button" :class="{primary:!canReview}" type="button" @click="goOtherDates">{{ t('查看其他团期') }}</button></div></div></div>
    <p v-if="msg" class="ed-feedback" role="status">{{ t(msg) }}</p>
  </div>
  <div v-else-if="err" class="order-detail"><section class="ed-card ed-error"><p>{{ t(err) }}</p><button class="ed-button" type="button" @click="load">{{ t('重新加载') }}</button></section></div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import LoadRow from "@/components/LoadRow.vue";
import WishGlyph from "@/components/WishGlyph.vue";
import { useUserStore } from "@/stores/user";
import { readLook } from "@/utils/appearance";
import { translate } from "@/utils/locale";
import { isReviewTrip } from "@/utils/trips";
import { canReorder, maskTravelerPhone, orderBadge, orderHint, orderMoney, orderNo, orderShop, orderSpec, orderIcon, payMethodLabel, placedLabel, priceLines } from "@/utils/orderView";

const pageRoute = useRoute();
const router = useRouter();
const store = useUserStore();
const order = ref(null);
const err = ref("");
const ready = ref(false);
const msg = ref("");
const cancelling = ref(false);
const submitting = ref(false);
const reviewOpen = ref(false);
const form = ref({ rating: 5, content: "" });
const language = ref(readLook().lang);
const onLook = () => { language.value = readLook().lang; };
window.addEventListener("bj-look", onLook);
onBeforeUnmount(() => window.removeEventListener("bj-look", onLook));
function t(text) { return translate(text, language.value); }

const activity = computed(() => order.value?.channel === "activity" || order.value?.kind === "activity");
const icon = computed(() => orderIcon(order.value));
const iconPaths = {
 trip:"m4 30 13-19 13 19M25 23l6-9 6 16M13 17l5 6 4-3",
 cards:"M16 10 9 9a3 3 0 0 0-3 3l-2 18a3 3 0 0 0 3 3l9 1M18 6l15 3a3 3 0 0 1 2 4l-4 20a3 3 0 0 1-4 2l-15-3a3 3 0 0 1-2-4l4-20a3 3 0 0 1 4-2Zm5 10-5 5 3 6 5-5-3-6Z",
 run:"M26 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM8 17l7-5 9 3 4 6 7 1M23 15l-6 10 8 4 3 8M18 24l-7 10H4",
 movie:"M5 12h30v23H5V12ZM5 12l-1-7 29-3 2 8M12 4l5 7m6-8 5 7M18 18l9 5-9 6v-11Z",
 club:"M16 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm14 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM5 34v-7a10 10 0 0 1 20 0v7m3-12a7 7 0 0 1 8 7v5",
};
const date = computed(() => [order.value?.start_date || order.value?.startDate || "",order.value?.meetup_time || order.value?.meetupTime || ""].filter(Boolean).join(" "));
const amount = computed(() => Number(order.value?.canPay ? order.value?.remainAmount ?? order.value?.payAmount ?? order.value?.pay_amount ?? 0 : order.value?.payAmount ?? order.value?.pay_amount ?? 0));
const amountLabel = computed(() => order.value?.canPay ? "剩余待付" : badge.value.key === "refund" ? "订单金额" : "费用合计");
const badge = computed(() => orderBadge(order.value));
const hint = computed(() => orderHint(order.value));
const shop = computed(() => orderShop(order.value));
const spec = computed(() => orderSpec(order.value));
const money = computed(() => orderMoney(order.value));
const prices = computed(() => priceLines(order.value));
const payMethod = computed(() => payMethodLabel(order.value));
const placed = computed(() => placedLabel(order.value));
const no = computed(() => orderNo(order.value));
const phone = computed(() => maskTravelerPhone(order.value?.traveler_phone));
const place = computed(() => order.value?.meetup_point || order.value?.city || orderSpec(order.value));
const canReview = computed(() => isReviewTrip(order.value));
const again = computed(() => canReorder(order.value));
const hasActions = computed(() => order.value && (order.value.canCancel || order.value.canPay || (canReview.value && !reviewOpen.value) || (order.value.canAfter && order.value.completed) || again.value));
const wishEnrollmentId = computed(() => {
  const item = order.value;
  if (item?.canLinkWish !== true) return 0;
  // GET /orders/:id is built from enrollments, so its own id is an enrollment id.
  const id = Number(item.enrollmentId ?? item.enrollment_id ?? item.id);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
});

let requestVersion = 0;
onBeforeUnmount(() => { requestVersion += 1; });
onMounted(load);
watch(() => pageRoute.params.id, load);
watch(() => store.token, onAccountChange, { flush: "sync" });

function onAccountChange() {
  requestVersion++;
  order.value = null;
  err.value = "";
  msg.value = "";
  reviewOpen.value = false;
  form.value = { rating: 5, content: "" };
  cancelling.value = false;
  submitting.value = false;
  return load();
}

async function load() {
  const version = ++requestVersion;
  const id = pageRoute.params.id;
  const token = store.token;
  const active = () => version === requestVersion && token === store.token;
  err.value = "";
  ready.value = false;
  if (!token) {
    order.value = null;
    ready.value = true;
    router.replace({ path: "/m/login", query: { redirect: pageRoute.fullPath || "/m/orders/" + id } });
    return;
  }
  try {
    const response = await http.get("/orders/" + id);
    if (!active()) return;
    if (!response.data?.id) throw new Error("订单打不开");
    order.value = response.data;
    reviewOpen.value = pageRoute.query.review === "1" && canReview.value;
  } catch (e) {
    if (!active()) return;
    order.value = null;
    err.value = e.message || "订单打不开";
  } finally {
    if (active()) ready.value = true;
  }
}
function goPay() {
  if (order.value?.payShareToken) router.push("/m/pay/" + order.value.payShareToken);
}
function goWish() {
  if (order.value?.wishToken) { router.push("/m/wishes/" + encodeURIComponent(order.value.wishToken)); return; }
  if (wishEnrollmentId.value) router.push({ path: "/m/wishes/new", query: { kind: "trip", enrollmentId: String(wishEnrollmentId.value) } });
}
function goOtherDates() { if (canReorder(order.value)) router.push("/m/route/" + order.value.route_id); }
function goSchedule() {
  if (order.value?.schedule_id) router.push("/m/schedule/" + order.value.schedule_id);
}
async function copyNo() {
  try {
    await navigator.clipboard.writeText(no.value);
    msg.value = "已复制";
  } catch {
    msg.value = "复制失败";
  }
}
function cancelMessage() {
  const o = order.value;
  const deduct = Number(o && o.deductAmount) || 0;
  if (deduct > 0) {
    return `临近出发，取消将扣除 ${o.deductPercent}%（¥${deduct}），退回 ¥${Number(o.refundAmount) || 0}。确定取消报名？名额将释放给其他人。`;
  }
  if (o && o.refundHint) return `确定取消报名？${o.refundHint}。名额将释放给其他人。已付款按付款人原路退回。`;
  return "确定取消报名？名额将释放给其他人。已付款按付款人原路退回。";
}
async function cancel() {
  if (cancelling.value || !order.value?.canCancel) return;
  if (!window.confirm(cancelMessage())) return;
  cancelling.value = true;
  msg.value = "";
  try {
    await http.post(`/orders/${order.value.id}/cancel`);
    msg.value = "已取消报名";
    await load();
  } catch (e) {
    msg.value = e.message || "取消失败";
  } finally {
    cancelling.value = false;
  }
}
async function submitReview() {
  if (submitting.value || !canReview.value) return;
  submitting.value = true;
  msg.value = "";
  try {
    await http.post("/reviews", { scheduleId: order.value.schedule_id, rating: form.value.rating, content: form.value.content });
    msg.value = "评价已提交";
    reviewOpen.value = false;
    await load();
  } catch (e) {
    msg.value = e.message || "评价失败";
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.order-detail { --ed-purple:#5b3b8c; --ed-ink:#2d2834; --ed-muted:#8c8297; --ed-paper:#fff; --ed-soft:#f3eef8; --ed-line:#eee8f3; padding:2px 0 calc(105px + env(safe-area-inset-bottom)); color:var(--ed-ink); overflow-wrap:anywhere; }
.order-detail *,.order-detail *::before,.order-detail *::after { box-sizing:border-box; }.order-detail button,.order-detail textarea { font:inherit; }.order-detail button { cursor:pointer; }.order-detail svg { stroke:currentColor; stroke-width:1.4; stroke-linecap:round; stroke-linejoin:round; }.order-detail button:focus-visible { outline:2px solid #9d7dbd; outline-offset:3px; }
.ed-status { display:flex; align-items:flex-start; gap:14px; padding:15px 6px 24px; }.ed-state-mark { flex:none; width:43px; height:43px; margin-top:8px; display:grid; place-items:center; border:1px solid #d9cae8; border-radius:50%; background:var(--ed-soft); color:var(--ed-purple); }.ed-state-mark svg { width:28px; height:28px; }.ed-status > div { flex:1; min-width:0; }.ed-eyebrow { margin:0; color:var(--ed-muted); font-size:11px; line-height:1.6; }.ed-status h1 { margin:5px 0 8px; font-size:calc(25px * var(--ui-scale,1)); line-height:1.3; font-weight:600; letter-spacing:.02em; }.ed-status-hint { margin:0; color:var(--ed-muted); font-size:calc(12px * var(--ui-scale,1)); line-height:1.7; }
.ed-card { padding:17px; margin:0 0 12px; border:1px solid var(--ed-line); border-radius:17px; background:var(--ed-paper); }.ed-section-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:15px; }.ed-tag { color:var(--ed-purple); background:var(--ed-soft); padding:4px 8px; border-radius:5px; font-size:11px; line-height:1.5; }.order-detail .ed-link { display:flex; align-items:center; gap:7px; margin:0; padding:0; color:var(--ed-muted); border:0; background:transparent; border-radius:0; font-size:11px; }.ed-link span { font-size:19px; }.order-detail .ed-event-main { display:flex; align-items:center; gap:14px; width:100%; border:0; border-radius:0; padding:0; background:transparent; text-align:left; color:var(--ed-ink); }.ed-event-main img,.ed-placeholder { display:var(--media,block); width:78px; height:78px; flex:none; border-radius:11px; object-fit:cover; background:var(--ed-soft); }.ed-placeholder { display:grid; place-items:center; color:#a087b8; }.ed-placeholder svg { width:43px; height:43px; }.ed-event-title { flex:1; min-width:0; }.ed-event-title strong { display:block; font-size:calc(16px * var(--ui-scale,1)); font-weight:600; line-height:1.6; }.ed-event-title small { display:block; margin-top:8px; color:var(--ed-muted); font-size:11px; line-height:1.6; }.ed-card dl { margin:0; }.ed-card dl > div { display:flex; align-items:flex-start; gap:14px; justify-content:space-between; font-size:calc(12px * var(--ui-scale,1)); line-height:1.7; padding:7px 0; }.ed-card dt { color:var(--ed-muted); flex:none; }.ed-card dd { margin:0; min-width:0; text-align:right; }.ed-card .ed-arrangement { margin-top:16px; padding-top:8px; border-top:1px solid var(--ed-line); }.ed-arrangement > div { justify-content:flex-start !important; padding:5px 0 !important; }.ed-arrangement dt { min-width:52px; }.ed-arrangement dd { flex:1; text-align:left; }
.ed-card h2 { display:flex; justify-content:space-between; gap:12px; margin:0 0 12px; color:var(--ed-ink); font-size:calc(14px * var(--ui-scale,1)); font-weight:600; line-height:1.6; }.ed-card h2 small { color:var(--ed-muted); font-size:11px; font-weight:400; }.ed-person-row { display:flex; align-items:center; gap:12px; }.ed-person-row strong { display:block; font-size:calc(14px * var(--ui-scale,1)); line-height:1.6; font-weight:500; }.ed-person-row small { display:block; font-size:12px; color:var(--ed-muted); line-height:1.7; }.ed-person-mark { display:grid; place-items:center; width:36px; height:36px; flex:none; border-radius:50%; background:var(--ed-soft); color:#ac91c3; }.ed-person-mark svg { width:24px; height:24px; }.ed-total { display:flex; align-items:baseline; justify-content:space-between; gap:14px; margin-top:9px; padding-top:15px; border-top:1px solid var(--ed-line); font-size:12px; }.ed-total strong { color:var(--ed-purple); font-size:calc(23px * var(--ui-scale,1)); font-weight:600; line-height:1.3; }.ed-helper { margin:10px 0 0; color:var(--ed-muted); font-size:11px; line-height:1.7; }.ed-card .ed-order-no { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px; font-variant-numeric:tabular-nums; }.ed-order-no button { color:var(--ed-purple); border:0; border-radius:0; padding:0 3px; background:transparent; font-size:11px; }
.od-wish-entry { display:flex; align-items:center; gap:12px; width:100%; margin:0 0 12px; padding:16px; border:0; border-radius:16px; background:var(--ed-soft); color:var(--ed-purple); text-align:left; font:inherit; }.od-wish-entry > span:nth-child(2) { flex:1; min-width:0; }.od-wish-icon { width:27px; height:29px; flex:none; }.od-wish-entry strong { display:block; font-size:calc(13px * var(--ui-scale,1)); font-weight:500; line-height:1.6; }.od-wish-entry small { display:block; font-size:11px; color:var(--ed-muted); line-height:1.7; margin-top:3px; }.od-wish-arrow { font-size:25px; flex:none; color:var(--ed-muted); }
.order-detail .ed-button { display:inline-flex; justify-content:center; align-items:center; min-height:42px; padding:10px 15px; border:1px solid var(--ed-line); border-radius:999px; color:var(--ed-purple); background:var(--ed-paper); font-size:calc(12px * var(--ui-scale,1)); line-height:1.5; margin:0; }.order-detail .ed-button.primary { background:var(--ed-purple); color:var(--ed-paper); border-color:var(--ed-purple); font-weight:500; }.order-detail .ed-button:disabled { opacity:.5; cursor:wait; }.ed-dock { position:fixed; z-index:20; left:0; right:0; bottom:0; background:var(--ed-paper); padding:12px 16px calc(12px + env(safe-area-inset-bottom)); border-top:1px solid var(--ed-line); }.ed-dock-content { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:flex-end; max-width:528px; margin:auto; }.ed-dock-price { margin-right:auto; }.ed-dock-price small { display:block; color:var(--ed-muted); font-size:10px; }.ed-dock-price strong { display:block; color:var(--ed-purple); font-size:calc(20px * var(--ui-scale,1)); font-weight:600; margin-top:2px; }.ed-dock-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:7px; }.ed-dock-actions .ed-button { flex:1; white-space:nowrap; }.ed-record-note { margin:0; padding:12px; color:var(--ed-muted); font-size:11px; text-align:center; }.ed-error { text-align:center; }.ed-error p { margin:0 0 15px; }.ed-review textarea { width:100%; box-sizing:border-box; min-height:90px; padding:12px; margin:12px 0; background:var(--ed-soft); color:var(--ed-ink); border:0; border-radius:9px; font-size:12px; resize:vertical; }.ed-stars { display:flex; gap:8px; }.ed-stars button { border:0; border-radius:0; background:transparent; padding:0; font-size:26px; color:#ddd2e8; }.ed-stars button.on { color:#9b77ba; }.ed-feedback { color:var(--ed-purple); padding:12px; background:var(--ed-soft); border-radius:12px; font-size:12px; }
:global(.mp-phone:has(.order-detail) .mp-tab),:global(.mp-phone:has(.order-detail) > .icp-foot) { display:none; }
:global(html[data-night="dark"] .order-detail) { --ed-purple:#d2b5ef; --ed-ink:#eee7f5; --ed-muted:#b3a4c0; --ed-paper:#211c2a; --ed-soft:#30263d; --ed-line:#3c3047; }
:global(html[data-text="1"] .order-detail .ed-event-main img),:global(html[data-text="1"] .order-detail .ed-placeholder) { display:none; }
@media(min-width:700px) { .order-detail { max-width:680px; margin:auto; padding:10px 16px 130px; }.ed-card { padding:22px; }.ed-dock-content { max-width:648px; }.ed-status { padding:20px 6px 30px; }.ed-status h1 { font-size:30px; } }
</style>
