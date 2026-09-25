<template>
  <div v-if="card" class="member-page">
    <div class="member-hero">
      <div class="member-codes">
        <button v-for="item in card.levels" :key="item.level" type="button" :class="{ on: focus?.level === item.level }" @click="focus = item">
          {{ item.code }}
        </button>
      </div>
      <div class="member-mark">{{ focus?.code }}</div>
      <h2>{{ focus?.name }}</h2>
      <p>成长值 {{ card.growth }}/{{ nextGrowth }}</p>
      <div class="member-bar"><i :style="{ width: bar + '%' }"></i></div>
      <p class="member-sub">{{ hint }}</p>
      <p class="muted">本月累计新增 {{ card.monthGrowth }} 成长值</p>
    </div>
    <p class="member-perk-head">可享 {{ focus?.perks?.length || 0 }} 项权益</p>
    <div class="member-perks">
      <div v-for="perk in focus?.perks || []" :key="perk">{{ perk }}</div>
    </div>
    <p class="muted">等级按出行获得的成长值自动升级，不单独售卖。</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { setChrome } from "@/utils/pageChrome";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const focus = ref(null);

const card = computed(() => store.profile?.membership || null);
const nextGrowth = computed(() => {
  const levels = card.value?.levels || [];
  const next = levels.find((item) => item.level === (focus.value?.level || 0) + 1);
  return next ? next.growth : focus.value?.growth || 0;
});
const bar = computed(() => {
  if (!card.value || !focus.value) return 0;
  if (focus.value.level < card.value.level) return 100;
  if (focus.value.level > card.value.level) return 0;
  return Math.round((card.value.progress || 0) * 100);
});
const hint = computed(() => {
  if (!card.value || !focus.value) return "";
  if (focus.value.level === card.value.level && card.value.nextCode) return `升级${card.value.nextCode}`;
  if (focus.value.level < card.value.level) return "已达到";
  return `成长值满 ${focus.value.growth} 升到${focus.value.code}`;
});

onMounted(async () => {
  setChrome("会员中心", "按出行成长");
  if (!requireLogin(store, router, route)) return;
  await store.fetchMe().catch(() => {});
  focus.value = card.value?.levels?.find((item) => item.current) || card.value?.levels?.[0] || null;
});
</script>

<style scoped>
.member-hero { position: relative; padding: 16px; border-radius: 16px; background: linear-gradient(180deg, #efe7ff, #f7f4fb); color: #3a1848; overflow: hidden; }
.member-codes { display: flex; justify-content: space-between; }
.member-codes button { border: 0; background: transparent; color: #9b8aaf; font: inherit; }
.member-codes .on { color: #6b2178; font-weight: 700; }
.member-mark { position: absolute; right: 12px; top: 36px; font-size: 64px; font-weight: 800; color: rgba(107,33,120,.16); }
.member-hero h2 { margin: 16px 0 8px; font-size: 28px; }
.member-bar { height: 6px; border-radius: 99px; background: #e4d8f2; overflow: hidden; }
.member-bar i { display: block; height: 6px; background: #6b2178; }
.member-sub { color: #6b2178; font-size: 13px; }
.member-perk-head { text-align: center; color: #6b2178; }
.member-perks { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.member-perks div { background: #fff; border-radius: 12px; padding: 14px; font-weight: 650; }
</style>
