<template>
  <div v-if="data" class="pay-page">
    <div class="pay-hero">
      <div class="muted">{{ data.isOwner ? "已占座，请支付团费" : "帮付团费 · " + data.travelerName }}</div>
      <strong class="pay-title">{{ data.title }}</strong>
      <p class="muted">{{ data.startDate }} 出发</p>
      <div class="pay-due">¥{{ data.remainAmount }}</div>
      <p class="muted">待付 / 共 ¥{{ data.payAmount }}</p>
      <p v-if="data.paidAmount" class="muted">已收到 ¥{{ data.paidAmount }}</p>
    </div>

    <div v-if="data.canPay && data.isOwner" class="pay-modes">
      <button type="button" class="pay-mode" :class="{ on: mode === 'self' }" @click="setMode('self')">自己支付</button>
      <button type="button" class="pay-mode" :class="{ on: mode === 'proxy' }" @click="setMode('proxy')">邀请代付</button>
      <button type="button" class="pay-mode" :class="{ on: mode === 'split' }" @click="setMode('split')">一起分担</button>
    </div>
    <div v-else-if="data.canPay" class="pay-modes">
      <button type="button" class="pay-mode" :class="{ on: mode === 'self' }" @click="setMode('self')">代付全款</button>
      <button type="button" class="pay-mode" :class="{ on: mode === 'split' }" @click="setMode('split')">分担一部分</button>
    </div>

    <div v-if="data.canPay && mode === 'proxy'" class="card">
      <div class="pad">
        <p>朋友打开链接后可以付清这笔团费。¥{{ data.remainAmount }}</p>
        <button class="btn block" type="button" @click="share">发给朋友代付</button>
      </div>
    </div>

    <div v-else-if="data.canPay" class="card">
      <div class="pad">
        <template v-if="mode === 'split'">
          <label>你先付的金额（元）</label>
          <input class="input" v-model="amount" type="number" min="1" :max="data.remainAmount" />
        </template>
        <p v-if="walletBalance" class="muted">余额 ¥{{ walletBalance }}{{ walletCanCover ? "，可选用余额或微信" : "，不够付这笔时请用微信" }}</p>
        <div class="pay-actions">
          <button class="btn block" type="button" :disabled="paying" @click="pay('wechat')">{{ payLabel }}</button>
          <button v-if="walletBalance > 0" class="btn block" type="button" :disabled="paying || !walletCanCover" @click="pay('wallet')">余额支付 ¥{{ amount || data.remainAmount }}</button>
        </div>
        <button v-if="mode === 'split'" class="btn ghost block" type="button" style="margin-top:8px" @click="share">发给朋友付剩下的</button>
      </div>
    </div>

    <div v-if="data.helpers?.length" class="card">
      <div class="pad">
        <PayHelpers :list="data.helpers" />
      </div>
    </div>

    <p v-if="msg" :style="ok ? '' : 'color:var(--clay)'">{{ msg }}</p>

    <p v-if="!data.canPay && data.company" class="muted">公司团由开团方统一支付。</p>
    <p v-else-if="!data.canPay && data.cancelled" class="muted">该报名已取消或拼团已解散。</p>
    <p v-else-if="!data.canPay && data.payStatus === 'paid'" class="muted">团费已付清。</p>
    <p v-else-if="!data.canPay" class="muted">当前不能支付。</p>

    <button
      v-if="data.scheduleId"
      class="btn block"
      :class="data.payStatus === 'paid' ? 'clay' : 'ghost'"
      type="button"
      @click="goTrip"
    >查看行程</button>
  </div>
  <p v-else-if="err" style="color:var(--clay)">{{ err }}</p>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { setChrome } from "@/utils/pageChrome";
import { liveWechatPay, MINIPROGRAM_PAY_HINT } from "@/utils/wechatPay";
import { nativeShareSupported, payShareText, payShareUrl } from "@/utils/share";
import PayHelpers from "@/components/PayHelpers.vue";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const data = ref(null);
const err = ref("");
const msg = ref("");
const ok = ref(false);
const paying = ref(false);
const amount = ref("");
const mode = ref("self");

const payLabel = computed(() => {
  const n = Number(amount.value);
  if (!n) return "去支付";
  if (data.value && !data.value.isOwner && mode.value !== "split" && n === Number(data.value.remainAmount)) {
    return `微信代付 ¥${n}`;
  }
  return `微信支付 ¥${n}`;
});
const walletBalance = computed(() => Number(store.profile?.walletBalance || 0));
const walletCanCover = computed(() => walletBalance.value >= Number(amount.value || 0) && Number(amount.value || 0) > 0);

onMounted(load);

async function load() {
  setChrome("支付", data.value?.isOwner === false ? "代付或分担" : "自己付、代付或分担");
  err.value = "";
  try {
    await store.fetchMe().catch(() => {});
    const res = await http.get("/pay/share/" + route.params.token);
    const next = res.data;
    const keepSplit = mode.value === "split" && amount.value !== "";
    if (!next.isOwner && mode.value === "proxy") mode.value = "self";
    if (!keepSplit) amount.value = String(next.remainAmount || "");
    data.value = next;
    setChrome("支付", next.isOwner ? "自己付、代付或分担" : "代付或分担");
  } catch (e) {
    err.value = e.message || "付款分享不存在";
  }
}

function setMode(next) {
  mode.value = next;
  msg.value = "";
  ok.value = false;
  if (next !== "split" && data.value) amount.value = String(data.value.remainAmount || "");
}

async function pay(channel) {
  msg.value = "";
  ok.value = false;
  if (!requireLogin(store, router, route)) return;
  const n = Number(amount.value);
  if (!n) {
    msg.value = "请填写支付金额";
    return;
  }
  if (n > Number(data.value?.remainAmount || 0)) {
    msg.value = "不能超过待付金额";
    return;
  }
  paying.value = true;
  try {
    const method = channel === "wallet" ? "wallet" : "wechat";
    const res = await http.post("/pay/for-enrollment", {
      token: route.params.token,
      amount: n,
      channel: method,
    });
    if (liveWechatPay(res.data)) {
      msg.value = MINIPROGRAM_PAY_HINT;
      return;
    }
    ok.value = true;
    msg.value = res.data.payStatus === "paid" ? "已付清" : "已支付 ¥" + (res.data.amount || n);
    mode.value = "self";
    amount.value = "";
    if (method === "wallet") await store.fetchMe().catch(() => {});
    await load();
  } catch (e) {
    msg.value = e.message;
  } finally {
    paying.value = false;
  }
}

async function share() {
  const url = payShareUrl(location.origin, route.params.token);
  const text = payShareText({
    travelerName: data.value?.travelerName,
    title: data.value?.title,
    remainAmount: data.value?.remainAmount,
    url,
  });
  try {
    if (nativeShareSupported(navigator)) {
      await navigator.share({ title: "帮付团费", text, url });
      return;
    }
    await navigator.clipboard.writeText(text);
    msg.value = "已复制分享文案";
    ok.value = true;
  } catch {
    msg.value = text;
    ok.value = true;
  }
}

function goTrip() {
  if (data.value?.scheduleId) router.push("/m/schedule/" + data.value.scheduleId);
}
</script>

<style scoped>
.pay-hero {
  background: #fff;
  border-radius: 16px;
  padding: 18px 16px;
  margin-bottom: 12px;
}
.pay-title { display: block; margin-top: 6px; font-size: 18px; }
.pay-due { margin-top: 12px; font-size: 40px; font-weight: 700; color: #8c3038; line-height: 1.1; }
.pay-modes { display: flex; gap: 8px; margin-bottom: 12px; }
.pay-mode {
  flex: 1;
  border: 2px solid transparent;
  background: #fff;
  border-radius: 999px;
  padding: 10px 4px;
  font-size: 13px;
}
.pay-mode.on { border-color: #8c3038; color: #8c3038; font-weight: 700; }
.pay-actions { display: flex; flex-direction: column; gap: 8px; }
</style>
