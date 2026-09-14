<template>
  <div v-if="data">
    <div class="card">
      <div class="pad">
        <div class="muted">{{ data.isOwner ? "你的团费" : "帮 " + data.travelerName + " 付团费" }}</div>
        <strong>{{ data.title }}</strong>
        <p class="muted" style="margin:6px 0 0">{{ data.startDate }} 出发</p>
        <p class="price" style="margin:12px 0 0">待付 ¥{{ data.remainAmount }} / 共 ¥{{ data.payAmount }}</p>
        <p v-if="data.paidAmount" class="muted">已收到 ¥{{ data.paidAmount }}</p>
        <p class="muted">可以自己付、帮人付全款，或改成更少金额转发给朋友一起分摊。退款按付款人原路退回。</p>
      </div>
    </div>

    <div class="card" v-if="data.contributors?.length">
      <div class="pad">
        <strong>已付款</strong>
        <p v-for="(c, i) in data.contributors" :key="i" class="muted" style="margin:8px 0 0">
          {{ c.self ? "你" : c.nickname }} · ¥{{ c.amount }} · {{ c.remark || "微信支付" }}
        </p>
      </div>
    </div>

    <template v-if="data.canPay">
      <label>本次支付金额（元）</label>
      <input class="input" v-model="amount" type="number" min="1" :max="data.remainAmount" />
      <p v-if="msg" :style="ok ? '' : 'color:var(--clay)'">{{ msg }}</p>
      <button class="btn block" type="button" :disabled="paying" @click="pay">{{ payLabel }}</button>
      <button class="btn ghost block" type="button" style="margin-top:8px" @click="fillRemain">付剩余全部 ¥{{ data.remainAmount }}</button>
    </template>
    <p v-else-if="data.company" class="muted">公司团由开团方统一支付。</p>
    <p v-else-if="data.cancelled" class="muted">该报名已取消或拼团已解散。</p>
    <p v-else-if="data.payStatus === 'paid'" class="muted">团费已付清。</p>
    <p v-else class="muted">当前不能支付。</p>

    <button v-if="data.remainAmount > 0 && !data.cancelled && !data.company" class="btn ghost block" type="button" style="margin-top:8px" @click="share">转发给朋友分摊</button>
    <button class="btn ghost block" type="button" style="margin-top:8px" @click="goTrip">查看行程</button>
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

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const data = ref(null);
const err = ref("");
const msg = ref("");
const ok = ref(false);
const paying = ref(false);
const amount = ref("");

const payLabel = computed(() => {
  const n = Number(amount.value);
  if (data.value && n === Number(data.value.remainAmount)) {
    return store.token && data.value.isOwner ? `自己支付 ¥${n}` : `代付 ¥${n}`;
  }
  if (n > 0) return `支付 ¥${n}`;
  return "去支付";
});

onMounted(load);

async function load() {
  setChrome("付团费", "自己付、代付或分摊");
  err.value = "";
  try {
    const res = await http.get("/pay/share/" + route.params.token);
    data.value = res.data;
    amount.value = String(res.data.remainAmount || "");
  } catch (e) {
    err.value = e.message || "付款分享不存在";
  }
}

function fillRemain() {
  if (data.value) amount.value = String(data.value.remainAmount);
}

async function pay() {
  msg.value = "";
  ok.value = false;
  if (!requireLogin(store, router, route)) return;
  paying.value = true;
  try {
    const res = await http.post("/pay/for-enrollment", {
      token: route.params.token,
      amount: Number(amount.value),
    });
    if (liveWechatPay(res.data)) {
      msg.value = MINIPROGRAM_PAY_HINT;
      return;
    }
    ok.value = true;
    msg.value = res.data.payStatus === "paid" ? "已付清" : "已支付 ¥" + (res.data.amount || amount.value) + "，还差 ¥" + (res.data.remainAmount || 0);
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
  }
}

function goTrip() {
  if (data.value?.scheduleId) router.push("/m/schedule/" + data.value.scheduleId);
}
</script>
