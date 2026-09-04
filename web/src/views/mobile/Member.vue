<template>
  <div>
    <div v-if="store.profile?.isMember" class="card" style="background:linear-gradient(135deg,#1b4332,#40916c);color:#fff">
      <div class="pad">
        <div class="row">
          <div>
            <div style="font-size:20px;font-weight:700">{{ store.profile.nickname }}</div>
            <div style="opacity:.85">同行者众会员</div>
          </div>
          <span class="tag" style="background:#ffd166;color:#1b4332">会员</span>
        </div>
        <div class="row" style="margin-top:16px">
          <div>积分 {{ store.profile.points }}</div>
          <div>到期 {{ store.profile.memberExpireAt }}</div>
        </div>
      </div>
    </div>

    <div class="card"><div class="pad">
      <h3 style="margin-top:0">{{ store.profile?.isMember ? "会员权益" : "开通同行者众会员" }}</h3>
      <p>年费 ¥{{ fee }}，线路额外 95 折，赠送一次 100 元以内的团，积分 1.2 倍加速。</p>
      <ul>
        <li>会员价自动按 95 折计算</li>
        <li>开通即赠一次 100 元以内团免费名额<template v-if="store.profile?.isMember">（剩余 {{ store.profile.memberGiftLeft || 0 }} 次）</template></li>
        <li>参加活动累积积分，100 积分抵 1 元</li>
        <li>开团、报名、分享不受限</li>
      </ul>
      <button class="btn block" :disabled="loading" @click="buy">
        {{ loading ? "开通中…" : store.profile?.isMember ? "续费会员" : "开通会员" }}
      </button>
      <p class="muted">{{ msg }}</p>
    </div></div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const fee = ref(99);
const msg = ref("");
const loading = ref(false);
onMounted(async () => {
  if (!requireLogin(store, router, route)) return;
  fee.value = store.meta?.memberAnnualFee || 99;
  await store.fetchMe().catch(() => {});
});
async function buy() {
  loading.value = true;
  msg.value = "";
  try {
    const wasMember = !!store.profile?.isMember;
    const res = await http.post("/member/buy");
    store.setAuth(store.token, res.data.user);
    msg.value = wasMember ? "续费成功" : "开通成功";
  } catch (e) {
    msg.value = e.message || "开通失败";
  } finally {
    loading.value = false;
  }
}
</script>
