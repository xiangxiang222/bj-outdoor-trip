<template>
  <LoadRow v-if="!ready" />
  <div v-else-if="data" class="pay-page" :aria-busy="refreshing || paying">
    <section class="pay-summary" aria-labelledby="pay-summary-title">
      <div class="pay-summary-top"><span class="pay-eyebrow">{{ t('团费支付') }}</span><span class="pay-status" :class="{ complete: isPaid }"><i></i>{{ t(statusTitle) }}</span></div>
      <p id="pay-summary-title" class="pay-amount-caption">{{ t(data.canPay ? '还需支付' : isPaid ? '团费已付清' : '订单团费') }}</p>
      <div class="pay-total"><span>¥</span><strong>{{ money(data.canPay ? data.remainAmount : data.payAmount) }}</strong></div>
      <div class="pay-progress-copy"><span>{{ t('团费合计') }} ¥{{ money(data.payAmount) }}</span><span>{{ t('已付') }} ¥{{ money(data.paidAmount) }}</span></div>
      <div class="pay-progress-track" role="progressbar" :aria-label="t('团费支付进度')" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: progress + '%' }"></i></div>
      <div class="pay-trip">
        <img v-if="data.cover" :src="data.cover" alt="" />
        <span v-else class="pay-trip-icon" aria-hidden="true"><svg viewBox="0 0 28 28" fill="none"><path d="m3 22 9-15 6 10 3-5 5 10M9 12l3 3 3-3" /></svg></span>
        <div><h1>{{ data.title }}</h1><p><span>{{ data.startDate }} {{ t('出发') }}</span><span>{{ t('出行人') }} · {{ data.travelerName }}</span></p></div>
      </div>
    </section>

    <div v-if="err || refreshing" class="pay-refresh" :class="{ error: err }" role="status"><span>{{ refreshing ? t('正在更新付款信息…') : err }}</span><button v-if="err && !refreshing" class="pay-retry" type="button" @click="load">{{ t('重试') }}</button></div>

    <template v-if="data.canPay">
      <section class="pay-choice" aria-labelledby="pay-choice-title">
        <div class="pay-section-head"><h2 id="pay-choice-title">{{ t('选择付款方式') }}</h2><span>{{ t(data.isOwner ? '按你的方式，一起出发' : '为这份订单支付团费') }}</span></div>
        <div class="pay-modes" :class="{ 'is-guest': !data.isOwner }" role="group" :aria-label="t('付款方式')">
          <button v-for="item in modes" :key="item.key" type="button" class="pay-mode" :data-mode="item.key" :class="{ on: mode === item.key }" :aria-pressed="mode === item.key" :disabled="paying || refreshing || paymentPending" @click="setMode(item.key)">
            <span class="pay-mode-icon" aria-hidden="true"><svg viewBox="0 0 28 28" fill="none"><template v-if="item.key === 'self'"><rect x="4" y="6" width="20" height="17" rx="3" /><path d="M4 11h20m-15 6h4m6 0h1" /></template><template v-else-if="item.key === 'proxy'"><circle cx="10" cy="9" r="4" /><path d="M3 23v-3a7 7 0 0 1 14 0v3M21 5v8m-4-4h8M20 17h5m-2-2 2 2-2 2" /></template><template v-else><circle cx="14" cy="6" r="3" /><circle cx="6" cy="21" r="3" /><circle cx="22" cy="21" r="3" /><path d="M14 9v5m-8 4v-4h16v4" /></template></svg></span>
            <strong>{{ t(item.title) }}</strong><small>{{ t(item.note) }}</small><span class="pay-mode-check" aria-hidden="true"><svg v-if="mode === item.key" viewBox="0 0 16 16" fill="none"><path d="m4 8 3 3 5-6" /></svg></span>
          </button>
        </div>
      </section>

      <section v-if="mode === 'proxy'" class="pay-panel pay-invite" aria-labelledby="pay-panel-title">
        <div class="pay-invite-art" aria-hidden="true"><svg viewBox="0 0 64 48" fill="none"><rect x="5" y="5" width="40" height="31" rx="6" /><path d="M5 15h40M14 25h9M42 40h16m-6-6 6 6-6 6" /></svg></div>
        <h2 id="pay-panel-title">{{ t('把这份心意，交给熟悉的人') }}</h2><p>{{ t('分享订单链接，朋友可代付剩余团费，也可选择分摊一部分。') }}</p>
        <div class="pay-invite-due"><span>{{ t('待付团费') }}</span><strong>¥{{ money(data.remainAmount) }}</strong></div>
        <button class="pay-submit" type="button" :disabled="sharing || paying || refreshing || paymentPending || !!err" @click="share">{{ sharing ? t('准备分享…') : t('发给朋友代付') }}<span aria-hidden="true">↗</span></button>
      </section>

      <section v-else class="pay-panel" aria-labelledby="pay-panel-title">
        <div class="pay-section-head"><h2 id="pay-panel-title">{{ t(mode === 'split' ? '这一份，你想付多少' : data.isOwner ? '付清剩余团费' : '为朋友付清剩余团费') }}</h2><span v-if="mode !== 'split'">¥{{ money(data.remainAmount) }}</span></div>
        <template v-if="mode === 'split'">
          <p class="pay-panel-note">{{ t('每笔付款直接抵扣这份订单，不会增加报名人数。') }}</p>
          <label class="pay-amount-field" for="pay-amount"><span aria-hidden="true">¥</span><input id="pay-amount" v-model="amount" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="9" :disabled="paying || refreshing || paymentPending" :placeholder="t('填写本次支付金额')" :aria-label="t('本次支付金额（整数元）')" aria-describedby="pay-amount-help" @input="clearMessage" /></label>
          <div class="pay-amount-tools"><span id="pay-amount-help">{{ t('整数元，最多') }} ¥{{ money(data.remainAmount) }}</span><div><button type="button" :disabled="paying || refreshing || paymentPending" @click="fillAmount('half')">{{ t('付一半') }}</button><button type="button" :disabled="paying || refreshing || paymentPending" @click="fillAmount('rest')">{{ t('付剩余') }}</button></div></div>
        </template>
        <div class="pay-channels" role="group" :aria-label="t('支付渠道')">
          <button type="button" class="pay-channel" data-channel="wechat" :class="{ selected: channel === 'wechat' }" :aria-pressed="channel === 'wechat'" :disabled="paying || refreshing || paymentPending" @click="channel = 'wechat'; clearMessage()"><span class="pay-channel-icon wechat" aria-hidden="true"><svg viewBox="0 0 26 26" fill="none"><path d="M21 13c0 4.4-4 8-9 8a11 11 0 0 1-3.3-.5L4 23l1.4-4.3A7.6 7.6 0 0 1 3 13c0-4.4 4-8 9-8s9 3.6 9 8Z" /><circle cx="9" cy="12" r=".8" fill="currentColor" /><circle cx="15" cy="12" r=".8" fill="currentColor" /></svg></span><span class="pay-channel-copy"><strong>{{ t('微信支付') }}</strong><small>{{ t('网页微信支付，请到小程序完成') }}</small></span><span class="pay-radio" aria-hidden="true"></span></button>
          <button type="button" class="pay-channel" data-channel="wallet" :class="{ selected: channel === 'wallet' }" :aria-pressed="channel === 'wallet'" :disabled="paying || refreshing || paymentPending || !walletCanCover" @click="channel = 'wallet'; clearMessage()"><span class="pay-channel-icon" aria-hidden="true"><svg viewBox="0 0 26 26" fill="none"><path d="M21 9V6a2 2 0 0 0-2-2H7a3 3 0 0 0 0 6h14v11H7a3 3 0 0 1-3-3V7m13 7h5v4h-5v-4Z" /></svg></span><span class="pay-channel-copy"><strong>{{ t('余额支付') }}</strong><small>{{ t('可用余额') }} ¥{{ money(walletBalance) }}<span v-if="!walletCanCover && payableAmount > 0"> · {{ t('余额不足') }}</span></small></span><span class="pay-radio" aria-hidden="true"></span></button>
        </div>
        <button class="pay-submit" type="button" :disabled="paying || refreshing || paymentPending || !!err || (channel === 'wallet' && !walletCanCover)" @click="pay"><span>{{ paying ? t('正在处理…') : t('确认支付') }}<template v-if="!paying && payableAmount > 0"> ¥{{ money(payableAmount) }}</template></span><svg v-if="!paying" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></button>
        <button v-if="mode === 'split'" class="pay-share-link" type="button" :disabled="paying || sharing || refreshing || paymentPending || !!err" @click="share">{{ sharing ? t('准备分享…') : t('邀请朋友一起分摊') }} <span aria-hidden="true">↗</span></button>
        <p class="pay-footnote"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m10 2 6 3v5c0 3-3 6-6 8-3-2-6-5-6-8V5l6-3Z" /><path d="m7 10 2 2 4-4" /></svg>{{ t('付款仅用于本订单，退款按订单规则退回原付款人。') }}</p>
      </section>
    </template>

    <section v-else class="pay-panel pay-result" aria-labelledby="pay-result-title"><span class="pay-result-icon" aria-hidden="true"><svg v-if="isPaid" viewBox="0 0 32 32" fill="none"><path d="m8 16 6 6L25 9" /></svg><svg v-else viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="11" /><path d="M16 10v7m0 5h.01" /></svg></span><h2 id="pay-result-title">{{ t(statusTitle) }}</h2><p>{{ t(statusDescription) }}</p></section>

    <div v-if="paymentPending && !refreshing && !err" class="pay-refresh" role="status"><span>{{ t('正在确认支付结果，请勿重复付款') }}</span><button class="pay-retry" type="button" :disabled="paying" @click="load">{{ t('刷新结果') }}</button></div>
    <p v-if="msg && !paymentPending" class="pay-message" :class="{ success: ok }" :role="ok ? 'status' : 'alert'" aria-live="polite">{{ t(msg) }}</p>
    <section v-if="contributors.length" class="pay-panel pay-records" aria-labelledby="pay-records-title"><div class="pay-section-head"><h2 id="pay-records-title">{{ t('付款记录') }}</h2><span>{{ t('每一份，都有记录') }}</span></div><div v-for="(item, index) in contributors" :key="item.userId + '-' + index" class="pay-record"><span class="pay-payer-avatar" aria-hidden="true">{{ (item.self ? t('你') : item.nickname || t('同行')).slice(0, 1) }}</span><div><strong>{{ item.self ? t('你') : item.nickname || t('同行') }}</strong><small>{{ t(item.helper ? '朋友代付' : '本人支付') }}<span v-if="item.createdAt"> · {{ recordDate(item.createdAt) }}</span></small></div><b>¥{{ money(item.amount) }}</b></div></section>
    <button v-if="data.scheduleId" type="button" class="pay-trip-link" :disabled="paying" @click="goTrip">{{ t('查看行程') }}<span aria-hidden="true">→</span></button>
  </div>
  <section v-else class="pay-empty" role="alert"><span class="pay-result-icon" aria-hidden="true">!</span><h1>{{ t('暂时无法打开付款信息') }}</h1><p>{{ err || t('付款分享不存在或已失效') }}</p><button type="button" class="pay-submit pay-retry" @click="load">{{ t('重新加载') }}</button></section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import LoadRow from "@/components/LoadRow.vue";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { setChrome } from "@/utils/pageChrome";
import { liveWechatPay, MINIPROGRAM_PAY_HINT } from "@/utils/wechatPay";
import { nativeShareSupported, payShareText, payShareUrl } from "@/utils/share";
import { readLook } from "@/utils/appearance";
import { translate } from "@/utils/locale";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const data = ref(null);
const err = ref("");
const ready = ref(false);
const refreshing = ref(false);
const msg = ref("");
const ok = ref(false);
const paying = ref(false);
const sharing = ref(false);
const paymentPending = ref(false);
let pendingPayment = null;
const amount = ref("");
const mode = ref("self");
const channel = ref("wechat");
const language = ref(readLook().lang);
const onLook = () => { language.value = readLook().lang; };
window.addEventListener("bj-look", onLook);
function t(text) { return translate(text, language.value); }
let loadVersion = 0;
let active = true;
const identity = () => `${String(route.params.token || "")}\n${store.token || ""}\n${route.fullPath}`;
const current = (key) => active && key === identity();
const modes = computed(() => data.value?.isOwner ? [
  { key: "self", title: "自己支付", note: "一次付清" },
  { key: "proxy", title: "找人代付", note: "分享给朋友" },
  { key: "split", title: "分摊团费", note: "各付一部分" },
] : [
  { key: "self", title: "代付剩余", note: "为朋友付清" },
  { key: "split", title: "分摊团费", note: "各付一部分" },
]);
const contributors = computed(() => data.value?.contributors || data.value?.helpers || []);
const remaining = computed(() => Math.max(0, Number(data.value?.remainAmount || 0)));
const payableAmount = computed(() => mode.value === "split" ? Number(amount.value) || 0 : remaining.value);
const walletBalance = computed(() => Number(store.profile?.walletBalance || 0));
const walletCanCover = computed(() => payableAmount.value > 0 && Number.isInteger(payableAmount.value) && walletBalance.value >= payableAmount.value);
const isPaid = computed(() => data.value?.payStatus === "paid" && !data.value?.cancelled && !data.value?.company && !["applied", "waitlist"].includes(data.value?.enrollmentStatus));
const progress = computed(() => {
  const total = Number(data.value?.payAmount || 0);
  return isPaid.value ? 100 : total > 0 ? Math.min(100, Math.max(0, Number(data.value?.paidAmount || 0) / total * 100)) : 0;
});
const statusTitle = computed(() => {
  const item = data.value || {};
  if (item.payStatus === "refunded") return "已退款";
  if (item.cancelled) return "报名已取消";
  if (item.enrollmentStatus === "waitlist") return "正在候补";
  if (item.enrollmentStatus === "applied") return "等待抽签确认";
  if (item.company) return "企业统一支付";
  if (item.payStatus === "paid") return "团费已付清";
  if (item.canPay) return Number(item.paidAmount) > 0 ? "部分已付" : "待付款";
  return "当前无需付款";
});
const statusDescription = computed(() => {
  const item = data.value || {};
  if (item.payStatus === "refunded") return "可在原付款渠道查看退款记录。";
  if (item.cancelled) return "该报名已取消或团期已解散，请在行程中查看详情。";
  if (["waitlist", "applied"].includes(item.enrollmentStatus)) return "获得席位后，再按报名结果完成付款。";
  if (item.company) return "公司团由开团方统一支付，你无需单独付款。";
  if (item.payStatus === "paid") return "每一份心意已到账，期待一起出发。";
  return "请在行程中查看最新报名和支付状态。";
});

watch(() => [route.fullPath, store.token], () => {
  loadVersion += 1;
  data.value = null;
  ready.value = false;
  amount.value = "";
  mode.value = route.query.mode === "split" ? "split" : "self";
  channel.value = "wechat";
  paying.value = false;
  sharing.value = false;
  paymentPending.value = false;
  pendingPayment = null;
  clearMessage();
  load();
}, { immediate: true });
watch(walletCanCover, (covered) => { if (!covered && channel.value === "wallet") channel.value = "wechat"; });
onBeforeUnmount(() => { active = false; loadVersion += 1; window.removeEventListener("bj-look", onLook); });

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) : "0";
}
function recordDate(value) { return String(value).slice(0, 16).replace("T", " "); }
function clearMessage() { msg.value = ""; ok.value = false; }
async function load() {
  const key = identity();
  const version = ++loadVersion;
  const token = String(route.params.token || "");
  const authToken = store.token;
  refreshing.value = true;
  err.value = "";
  setChrome("团费支付", "自己支付 · 找人代付 · 分摊团费");
  try {
    if (!token) throw new Error("付款分享不存在或已失效");
    const [payment, profile] = await Promise.allSettled([
      http.get("/pay/share/" + encodeURIComponent(token)),
      authToken ? http.get("/me") : Promise.resolve(null),
    ]);
    if (!current(key) || version !== loadVersion) return;
    if (profile.status === "fulfilled" && profile.value?.data) store.setAuth(authToken, profile.value.data);
    if (payment.status === "rejected") throw payment.reason;
    const next = payment.value.data;
    if (!next.isOwner && mode.value === "proxy") mode.value = "self";
    data.value = next;
    if (pendingPayment) {
      const paid = next.payStatus === "paid";
      const advanced = Number(next.paidAmount || 0) >= pendingPayment.oldPaid + pendingPayment.amount;
      if (paid || advanced || !next.canPay) {
        pendingPayment = null;
        paymentPending.value = false;
        ok.value = paid || advanced;
        msg.value = paid ? "团费已付清" : advanced ? "本次付款已到账" : "支付结果已更新，请在订单中查看";
      }
    }
    return next;
  } catch (e) {
    if (current(key) && version === loadVersion) err.value = e.message || "付款信息加载失败，请重试";
    return null;
  } finally {
    if (current(key) && version === loadVersion) { ready.value = true; refreshing.value = false; }
  }
}
function setMode(next) {
  if (paying.value || refreshing.value || paymentPending.value || !data.value?.canPay || !modes.value.some((item) => item.key === next)) return;
  if (next !== mode.value) amount.value = "";
  mode.value = next;
  clearMessage();
}
function fillAmount(kind) {
  if (paying.value || refreshing.value || paymentPending.value) return;
  amount.value = String(kind === "half" ? Math.ceil(remaining.value / 2) : remaining.value);
  clearMessage();
}
async function pay() {
  if (paying.value || refreshing.value || paymentPending.value || err.value || !data.value?.canPay || mode.value === "proxy") return;
  clearMessage();
  if (!requireLogin(store, router, route)) return;
  const input = mode.value === "split" ? String(amount.value).trim() : String(remaining.value);
  const n = Number(input);
  if (!input) { msg.value = "请填写支付金额"; return; }
  if (!/^\d+$/.test(input) || !Number.isSafeInteger(n) || n < 1) { msg.value = "请输入大于 0 的整数金额"; return; }
  if (n > remaining.value) { msg.value = "不能超过待付金额"; return; }
  if (channel.value === "wallet" && !walletCanCover.value) { msg.value = "余额不足，请选择微信支付"; return; }
  const key = identity();
  const token = String(route.params.token || "");
  const selectedMode = mode.value;
  const method = channel.value;
  const oldPaid = Number(data.value?.paidAmount || 0);
  let submitted = false;
  paying.value = true;
  try {
    // Browser pages cannot invoke the native mini-program payment sheet. Do not
    // reserve a live prepay order merely to tell the user to switch clients.
    if (method === "wechat") {
      if (!store.meta) await store.fetchMeta();
      if (!current(key)) return;
      if (store.meta?.wechatPayMock !== true) { msg.value = MINIPROGRAM_PAY_HINT; return; }
    }
    submitted = true;
    const response = await http.post("/pay/for-enrollment", { token, amount: n, channel: method });
    if (!current(key)) return;
    if (liveWechatPay(response.data) || response.data?.needPay) { msg.value = MINIPROGRAM_PAY_HINT; await load(); return; }
    pendingPayment = { amount: n, oldPaid };
    paymentPending.value = true;
    amount.value = "";
    mode.value = selectedMode;
    msg.value = "正在确认支付结果，请勿重复付款";
    await load();
  } catch (e) {
    if (current(key)) {
      // Losing the response does not prove the charge failed. Keep the order
      // locked until a fresh ledger confirms whether this payment arrived.
      if (submitted && !e.status) {
        pendingPayment = { amount: n, oldPaid };
        paymentPending.value = true;
        amount.value = "";
        mode.value = selectedMode;
        msg.value = "正在确认支付结果，请勿重复付款";
      } else {
        msg.value = e.message || "付款未完成，请重试";
      }
      await load();
    }
  } finally {
    if (current(key)) paying.value = false;
  }
}
async function share() {
  if (sharing.value || paying.value || refreshing.value || paymentPending.value || err.value || !data.value?.canPay) return;
  const key = identity();
  sharing.value = true;
  clearMessage();
  const base = payShareUrl(location.origin, route.params.token);
  const url = mode.value === "split" ? base + "?mode=split" : base;
  const text = payShareText({ travelerName: data.value.travelerName, title: data.value.title, remainAmount: data.value.remainAmount, url });
  try {
    if (nativeShareSupported(navigator)) await navigator.share({ title: t(mode.value === "split" ? "一起分摊团费" : "帮朋友付团费"), text, url });
    else { await navigator.clipboard.writeText(text); if (current(key)) { msg.value = "已复制分享文案"; ok.value = true; } }
  } catch (e) {
    if (current(key) && e.name !== "AbortError") { msg.value = text; ok.value = true; }
  } finally { if (current(key)) sharing.value = false; }
}
function goTrip() { if (!paying.value && data.value?.scheduleId) router.push("/m/schedule/" + data.value.scheduleId); }
</script>

<style scoped>
.pay-page, .pay-empty { --pay-card:#fff; --pay-ink:#28252d; --pay-muted:#8a8392; --pay-purple:#5b3b8c; --pay-soft:#f5f1fa; --pay-line:#efebf4; --pay-success:#3c7d65; color:var(--pay-ink); max-width:760px; margin:0 auto; padding-bottom:12px; }
.pay-page *, .pay-empty * { box-sizing:border-box; }
.pay-page button, .pay-empty button { font:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.pay-page button:disabled, .pay-empty button:disabled { cursor:default; }
.pay-page button:focus-visible, .pay-empty button:focus-visible, .pay-page input:focus-visible { outline:2px solid var(--pay-purple); outline-offset:4px; }
.pay-page svg { stroke:currentColor; stroke-width:1.55; stroke-linecap:round; stroke-linejoin:round; }
.pay-summary, .pay-panel { border:1px solid var(--pay-line); border-radius:22px; background:var(--pay-card); }
.pay-summary { padding:21px 20px 0; background-image:radial-gradient(ellipse at 100% 0, var(--pay-soft), transparent 65%); }
.pay-summary-top, .pay-progress-copy, .pay-section-head, .pay-invite-due { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.pay-summary-top { flex-wrap:wrap; }
.pay-eyebrow { font-size:calc(12px * var(--ui-scale)); font-weight:600; letter-spacing:1px; color:var(--pay-purple); }
.pay-status { display:inline-flex; align-items:center; gap:5px; min-width:0; max-width:100%; font-size:calc(11px * var(--ui-scale)); color:var(--pay-purple); overflow-wrap:anywhere; }
.pay-status i { flex:none; width:5px; height:5px; border-radius:50%; background:currentColor; }
.pay-status.complete { color:var(--pay-success); }
.pay-amount-caption { margin:23px 0 4px; color:var(--pay-muted); font-size:calc(12px * var(--ui-scale)); }
.pay-total { display:flex; align-items:baseline; gap:5px; color:var(--pay-purple); line-height:1.2; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
.pay-total > span { font-size:calc(21px * var(--ui-scale)); }
.pay-total strong { min-width:0; font-size:calc(46px * var(--ui-scale)); font-weight:600; letter-spacing:-1.5px; }
.pay-progress-copy { flex-wrap:wrap; margin-top:19px; color:var(--pay-muted); font-size:calc(11px * var(--ui-scale)); line-height:1.5; }
.pay-progress-copy span:last-child { color:var(--pay-purple); }
.pay-progress-track { height:4px; margin-top:9px; background:var(--pay-line); overflow:hidden; border-radius:5px; }
.pay-progress-track i { display:block; height:100%; border-radius:inherit; background:#9a7abd; transition:width .25s ease; }
.pay-trip { display:flex; align-items:center; gap:11px; margin-top:20px; padding:17px 0; border-top:1px solid var(--pay-line); }
.pay-trip > img, .pay-trip-icon { flex:none; width:47px; height:51px; border-radius:10px; object-fit:cover; }
.pay-trip-icon { display:flex; align-items:center; justify-content:center; background:var(--pay-soft); color:var(--pay-purple); }
.pay-trip-icon svg { width:30px; }
.pay-trip > div { min-width:0; }
.pay-trip h1 { margin:0; font-size:calc(14px * var(--ui-scale)); font-weight:600; line-height:1.5; overflow-wrap:anywhere; }
.pay-trip p { display:flex; flex-wrap:wrap; gap:3px 12px; margin:4px 0 0; color:var(--pay-muted); font-size:calc(10px * var(--ui-scale)); line-height:1.5; }
.pay-choice { margin-top:25px; }
.pay-section-head { align-items:baseline; flex-wrap:wrap; gap:5px 10px; }
.pay-section-head h2 { margin:0; font-size:calc(15px * var(--ui-scale)); font-weight:600; line-height:1.5; }
.pay-section-head > span { color:var(--pay-muted); font-size:calc(10px * var(--ui-scale)); line-height:1.5; }
.pay-modes { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:9px; margin:12px 0 15px; }
.pay-modes.is-guest { grid-template-columns:repeat(2,minmax(0,1fr)); }
.pay-mode { position:relative; display:flex; min-width:0; flex-direction:column; align-items:flex-start; gap:3px; padding:14px 11px 12px; border:1px solid var(--pay-line); border-radius:15px; background:var(--pay-card); text-align:left; color:var(--pay-ink); line-height:1.45; }
.pay-mode.on { border-color:#a28aba; background:var(--pay-soft); color:var(--pay-purple); }
.pay-mode:disabled { opacity:.65; }
.pay-mode-icon { width:28px; height:28px; margin-bottom:7px; color:var(--pay-purple); }
.pay-mode-icon svg { width:100%; height:100%; }
.pay-mode strong { font-size:calc(13px * var(--ui-scale)); font-weight:600; overflow-wrap:anywhere; }
.pay-mode small { color:var(--pay-muted); font-size:calc(10px * var(--ui-scale)); overflow-wrap:anywhere; }
.pay-mode-check { position:absolute; right:9px; top:12px; display:grid; place-items:center; width:13px; height:13px; border-radius:50%; border:1px solid var(--pay-line); }
.pay-mode.on .pay-mode-check { border-color:var(--pay-purple); background:var(--pay-purple); color:#fff; }
.pay-mode-check svg { width:12px; height:12px; stroke-width:1.8; }
.pay-panel { padding:19px 17px; margin-top:14px; }
.pay-panel-note { margin:7px 0 17px; color:var(--pay-muted); font-size:calc(11px * var(--ui-scale)); line-height:1.8; }
.pay-amount-field { display:flex; align-items:center; gap:9px; padding:8px 2px 11px; border-bottom:1px solid var(--pay-line); color:var(--pay-purple); }
.pay-amount-field > span { font-size:calc(25px * var(--ui-scale)); }
.pay-amount-field input { width:100%; min-width:0; padding:6px 0; border:0; border-radius:0; box-shadow:none; background:transparent; color:var(--pay-ink); font-size:calc(29px * var(--ui-scale)); font-family:inherit; line-height:1.4; }
.pay-amount-field input::placeholder { color:#b9b2c2; font-size:calc(15px * var(--ui-scale)); letter-spacing:0; }
.pay-amount-tools { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:9px; margin:11px 0 23px; }
.pay-amount-tools > span { color:var(--pay-muted); font-size:calc(10px * var(--ui-scale)); }
.pay-amount-tools > div { display:flex; flex-wrap:wrap; gap:7px; }
.pay-amount-tools button { padding:6px 9px; border:0; border-radius:8px; background:var(--pay-soft); color:var(--pay-purple); font-size:calc(10px * var(--ui-scale)); line-height:1.4; }
.pay-channels { margin:15px 0 18px; }
.pay-channel { display:flex; align-items:center; gap:11px; width:100%; min-height:64px; padding:10px 0; border:0; background:transparent; color:var(--pay-ink); text-align:left; }
.pay-channel + .pay-channel { border-top:1px solid var(--pay-line); }
.pay-channel:disabled { opacity:.48; }
.pay-channel-icon { display:grid; place-items:center; width:33px; height:33px; flex:none; color:var(--pay-purple); background:var(--pay-soft); border-radius:10px; }
.pay-channel-icon.wechat { color:#328663; background:#edf6f1; }
.pay-channel-icon svg { width:24px; height:24px; }
.pay-channel-copy { display:flex; flex:1; min-width:0; flex-direction:column; gap:3px; }
.pay-channel-copy strong { font-size:calc(13px * var(--ui-scale)); font-weight:500; }
.pay-channel-copy small { color:var(--pay-muted); font-size:calc(10px * var(--ui-scale)); line-height:1.55; }
.pay-radio { position:relative; flex:none; width:18px; height:18px; border:1px solid #d6cfdf; border-radius:50%; }
.pay-channel.selected .pay-radio { border-color:var(--pay-purple); background:var(--pay-purple); }
.pay-channel.selected .pay-radio::after { position:absolute; left:5px; top:4px; width:6px; height:4px; border-left:1.6px solid #fff; border-bottom:1.6px solid #fff; transform:rotate(-45deg); content:""; }
.pay-submit { display:flex; align-items:center; justify-content:center; gap:16px; width:100%; min-height:49px; padding:13px 14px; border:0; border-radius:14px; color:#fff; background:#5b3b8c; font-size:calc(15px * var(--ui-scale)); font-weight:600; line-height:1.5; }
.pay-submit:disabled { opacity:.48; }
.pay-submit svg { width:20px; height:20px; flex:none; }
.pay-submit > span[aria-hidden] { font-size:20px; font-weight:400; }
.pay-share-link { display:block; width:100%; margin-top:8px; padding:10px; border:0; background:transparent; color:var(--pay-purple); font-size:calc(12px * var(--ui-scale)); line-height:1.5; }
.pay-share-link:disabled { opacity:.5; }
.pay-footnote { display:flex; align-items:flex-start; gap:5px; margin:13px 0 0; color:var(--pay-muted); font-size:calc(9px * var(--ui-scale)); line-height:1.7; }
.pay-footnote svg { flex:none; width:14px; height:14px; margin-top:1px; }
.pay-invite { padding-top:25px; text-align:center; }
.pay-invite-art { display:grid; place-items:center; width:83px; height:74px; margin:0 auto 15px; border-radius:22px; background:var(--pay-soft); color:var(--pay-purple); }
.pay-invite-art svg { width:61px; height:48px; stroke-width:1.4; }
.pay-invite h2 { margin:0; font-size:calc(17px * var(--ui-scale)); font-weight:600; line-height:1.6; }
.pay-invite > p { margin:9px 3px 21px; color:var(--pay-muted); font-size:calc(12px * var(--ui-scale)); line-height:1.8; }
.pay-invite-due { padding:13px 0; margin-bottom:15px; border-top:1px solid var(--pay-line); border-bottom:1px solid var(--pay-line); color:var(--pay-muted); font-size:calc(12px * var(--ui-scale)); }
.pay-invite-due strong { color:var(--pay-purple); font-size:calc(20px * var(--ui-scale)); font-weight:600; }
.pay-result { padding:28px 21px; text-align:center; }
.pay-result-icon { display:grid; place-items:center; width:54px; height:54px; margin:0 auto 15px; border-radius:50%; background:var(--pay-soft); color:var(--pay-purple); font-size:28px; }
.pay-result-icon svg { width:32px; height:32px; stroke-width:1.7; }
.pay-result h2 { margin:0; font-size:calc(18px * var(--ui-scale)); font-weight:600; }
.pay-result p { margin:10px 0 0; color:var(--pay-muted); font-size:calc(12px * var(--ui-scale)); line-height:1.8; }
.pay-records .pay-section-head { padding-bottom:7px; }
.pay-record { display:flex; align-items:center; gap:9px; padding:14px 0; border-top:1px solid var(--pay-line); }
.pay-record:first-of-type { border-top:0; }
.pay-record:last-child { padding-bottom:0; }
.pay-payer-avatar { display:grid; place-items:center; flex:none; width:34px; height:34px; border-radius:50%; background:var(--pay-soft); color:var(--pay-purple); font-size:calc(13px * var(--ui-scale)); }
.pay-record > div { display:flex; min-width:0; flex:1; flex-direction:column; gap:4px; }
.pay-record strong { font-size:calc(12px * var(--ui-scale)); font-weight:500; overflow-wrap:anywhere; }
.pay-record small { color:var(--pay-muted); font-size:calc(9px * var(--ui-scale)); line-height:1.6; }
.pay-record b { font-size:calc(16px * var(--ui-scale)); font-weight:600; font-variant-numeric:tabular-nums; }
.pay-trip-link { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; margin-top:14px; min-height:45px; padding:11px; border:1px solid var(--pay-line); border-radius:13px; background:var(--pay-card); color:var(--pay-purple); font-size:calc(13px * var(--ui-scale)); }
.pay-refresh, .pay-message { display:flex; align-items:center; flex-wrap:wrap; justify-content:space-between; gap:8px; padding:11px 13px; margin:13px 0 0; border-radius:12px; color:var(--pay-purple); background:var(--pay-soft); font-size:calc(12px * var(--ui-scale)); line-height:1.8; overflow-wrap:anywhere; }
.pay-message { display:block; white-space:pre-wrap; }
.pay-message.success { color:var(--pay-success); }
.pay-refresh.error { color:#a34444; }
.pay-refresh button { flex:none; border:0; padding:4px 8px; border-radius:7px; background:var(--pay-card); color:var(--pay-purple); }
.pay-empty { padding:40px 17px; text-align:center; }
.pay-empty h1 { margin:0; font-size:calc(18px * var(--ui-scale)); font-weight:600; line-height:1.6; }
.pay-empty p { color:var(--pay-muted); font-size:calc(13px * var(--ui-scale)); line-height:1.7; overflow-wrap:anywhere; }
.pay-empty button { margin-top:24px; }
:global(html[data-night="dark"] .pay-page), :global(html[data-night="dark"] .pay-empty) { --pay-card:#242029; --pay-ink:#f0ebf5; --pay-muted:#b1a7bf; --pay-purple:#d0b7ef; --pay-soft:#32283e; --pay-line:#403548; --pay-success:#91c9ac; }
:global(html[data-night="dark"] .pay-channel-icon.wechat) { background:#253a31; color:#a0d2b3; }
:global(html[data-night="dark"] .pay-submit) { background:#7550a4; }
:global(html[data-night="dark"] .pay-refresh.error) { color:#efb0b0; }
@media (max-width:350px) { .pay-summary { padding:18px 15px 0; } .pay-panel { padding:17px 13px; } .pay-modes { gap:6px; } .pay-mode { padding:13px 8px 11px; } .pay-mode strong { font-size:calc(12px * var(--ui-scale)); } .pay-mode small { font-size:calc(9px * var(--ui-scale)); } .pay-mode-check { right:7px; } }
@media (min-width:720px) { .pay-summary { padding:27px 28px 0; } .pay-total strong { font-size:calc(54px * var(--ui-scale)); } .pay-panel { padding:24px 25px; } .pay-mode { padding:19px; } .pay-mode strong { font-size:calc(15px * var(--ui-scale)); } .pay-mode small { font-size:calc(12px * var(--ui-scale)); } .pay-mode-icon { margin-bottom:12px; } }
</style>
