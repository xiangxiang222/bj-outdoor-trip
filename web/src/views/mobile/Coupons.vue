<template>
  <div>
    <div v-if="!list.length" class="card"><div class="pad muted">还没有优惠券。公开券可扫码领取，定向券由后台发放到账。</div></div>
    <div class="card" v-for="c in list" :key="c.id" @click="open(c)">
      <div class="pad">
        <div class="row">
          <strong>{{ c.label }}</strong>
          <span class="tag">{{ statusText(c.status) }}</span>
        </div>
        <p style="margin:8px 0 0">{{ c.name }}</p>
        <p class="muted">{{ c.routeTitle }}<template v-if="c.startDate"> · {{ c.startDate }}</template></p>
        <div v-if="c.status === 'unused' && clock(c)" class="coupon-ttl">
          <div class="progress" :class="{ low: clock(c).percent < 20 }">
            <i :style="{ width: clock(c).percent + '%' }"></i>
          </div>
          <p class="muted">{{ clock(c).label }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { couponCountdown } from "@/utils/couponTime";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const list = ref([]);
const now = ref(Date.now());
let timer;

onMounted(async () => {
  if (!requireLogin(store, router, route)) return;
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  try {
    list.value = (await http.get("/me/coupons")).data || [];
  } catch {
    list.value = [];
  }
});
onUnmounted(() => clearInterval(timer));

function clock(c) {
  return couponCountdown(c, now.value);
}

function statusText(s) {
  const map = { unused: "未用", held: "候补占用", used: "已用", expired: "过期", void: "作废" };
  return map[s] || s;
}

function open(c) {
  if (c.status === "unused") router.push("/m/coupon/" + (c.campaignCode || c.code));
  else if (c.scheduleId) router.push("/m/schedule/" + c.scheduleId);
}
</script>
