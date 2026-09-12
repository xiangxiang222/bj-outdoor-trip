<template>
  <div v-if="data">
    <div class="card" style="background:linear-gradient(135deg,#1b4332,#40916c);color:#fff">
      <div class="pad">
        <div class="muted" style="opacity:.85">{{ data.universal ? "通用优惠券" : "本团优惠券" }}</div>
        <div style="font-size:28px;font-weight:700;margin:8px 0">{{ data.label }}</div>
        <div>{{ data.name }}</div>
        <p style="opacity:.9;margin:12px 0 0">余 {{ data.remain }}/{{ data.total }} · {{ statusText }}</p>
      </div>
    </div>
    <div class="card" v-if="data.schedule || data.universal"><div class="pad">
      <strong>{{ data.universal ? "全部个人拼团" : data.schedule.title }}</strong>
      <p class="muted">{{ data.universal ? "公司团除外，报名任一团可用" : data.schedule.startDate + " 出发" }}</p>
      <p v-if="quote" class="price">
        团价 ¥{{ quote.tripPrice }}
        <template v-if="quote.applyCoupon"> → 券后 ¥{{ quote.couponPay }}</template>
        <template v-else-if="quote.isMember"> · 会员价 ¥{{ quote.memberPay }}</template>
      </p>
      <p class="muted" v-if="quote && quote.reason">{{ quote.reason }}</p>
      <p class="muted" v-if="data.validHours && !ttl">领取后 {{ data.validHours }} 小时内可用。</p>
      <div v-if="ttl" class="coupon-ttl">
        <div class="progress" :class="{ low: ttl.percent < 20 }">
          <i :style="{ width: ttl.percent + '%' }"></i>
        </div>
        <p class="muted">{{ ttl.expired ? "这张券已过期" : ttl.label + "内可用" }}</p>
      </div>
      <p class="muted">保险另计，不参与优惠。{{ stackHint }}</p>
    </div></div>
    <p v-if="err" style="color:var(--clay)">{{ err }}</p>
    <button class="btn block" :disabled="loading" @click="claim">{{ cta }}</button>
    <button v-if="data.schedule" class="btn ghost block" style="margin-top:8px" @click="goTrip">查看行程</button>
  </div>
  <p v-else-if="err" style="color:var(--clay)">{{ err }}</p>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { couponCountdown } from "@/utils/couponTime";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const data = ref(null);
const err = ref("");
const loading = ref(false);
const now = ref(Date.now());
let timer;

const quote = computed(() => data.value?.quote || null);
const ttl = computed(() => {
  const mine = data.value?.myCoupon;
  if (!mine || mine.status === "used" || mine.status === "held") return null;
  return couponCountdown(
    {
      ...mine,
      validHours: data.value?.validHours,
      useEnd: data.value?.useEnd,
    },
    now.value
  );
});
const stackHint = computed(() => {
  const d = data.value || {};
  const bits = [];
  if (d.stackMember) bits.push("会员价");
  if (d.stackStudent) bits.push("学生价");
  return bits.length ? `可与${bits.join("、")}叠加。` : "与会员/学生价取更低，不叠加。";
});
const statusText = computed(() => {
  const s = data.value?.status;
  if (s === "paused") return "暂停领取";
  if (s === "off") return "已停用";
  return "领取中";
});
const cta = computed(() => {
  if (data.value?.myCoupon?.status === "used" || data.value?.myCoupon?.status === "held") return "已用于报名";
  if (data.value?.claimedByMe) return data.value.universal ? "已领取，去选团" : "已领取，去报名";
  if (data.value?.guaranteedForMe && !data.value?.claimedByMe) return "领取预留券并报名";
  if (data.value?.audience === "directed") return "该券需由后台发放";
  if (data.value?.audience === "member") return "会员领取并报名";
  return "领取并报名";
});

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  load();
});
onUnmounted(() => clearInterval(timer));

async function load() {
  err.value = "";
  try {
    data.value = (await http.get("/coupons/" + route.params.code)).data;
  } catch (e) {
    if (/请先登录/.test(e.message || "")) {
      requireLogin(store, router, route);
      return;
    }
    err.value = e.message || "优惠券不存在";
  }
}

async function claim() {
  err.value = "";
  if (!requireLogin(store, router, route)) return;
  if (data.value?.myCoupon?.status === "used" || data.value?.myCoupon?.status === "held") {
    goEnroll();
    return;
  }
  if (data.value?.claimedByMe) {
    goEnroll();
    return;
  }
  if (data.value && data.value.claimable === false) {
    err.value = data.value.audience === "directed" ? "该券需由后台发放" : (data.value.audience === "member" ? "仅会员可领取" : "暂不可领取");
    return;
  }
  loading.value = true;
  try {
    const res = await http.post("/coupons/" + route.params.code + "/claim");
    data.value = res.data;
    goEnroll();
  } catch (e) {
    err.value = e.message;
    load();
  } finally {
    loading.value = false;
  }
}

function goEnroll() {
  const id = data.value?.scheduleId;
  const code = data.value.myCoupon?.code || data.value.code;
  if (!id) {
    router.push("/m");
    return;
  }
  router.push("/m/enroll/" + id + "?coupon=" + encodeURIComponent(code));
}

function goTrip() {
  const id = data.value?.scheduleId;
  if (!id) return;
  router.push("/m/schedule/" + id);
}
</script>
