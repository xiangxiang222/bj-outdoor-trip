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

    <div v-else class="card"><div class="pad">
      <h3 style="margin-top:0">会员</h3>
      <p class="muted">报名报价会按账号本身计算。这里不提供单独开通或续费。</p>
    </div></div>
  </div>
</template>

<script setup>
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
onMounted(async () => {
  if (!requireLogin(store, router, route)) return;
  await store.fetchMe().catch(() => {});
});
</script>
