<template>
  <div v-if="card" class="member-page">
    <div class="member-hero">
      <div class="member-codes">
        <button v-for="item in card.levels" :key="item.level" type="button" :class="{ on: focus?.level === item.level }" @click="focus = item">
          {{ item.code }}
        </button>
      </div>
      <button v-if="nextLevel" class="member-next" type="button" @click="focus = nextLevel">›</button>
      <p class="member-now">{{ nowLine }}</p>
      <h2>同行者众会员</h2>
      <img v-if="focus" class="member-mark" :src="'/static/member/v' + focus.level + '.png'" alt="" />
      <div class="member-meter">
        <span>成长值 <b>{{ into }}</b>/{{ span }}</span>
        <div class="member-track">
          <i :style="{ width: bar + '%' }"></i>
          <em>{{ pill }}</em>
        </div>
      </div>
      <p class="member-month">本月累计新增 {{ card.monthGrowth }} 成长值 ›</p>
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
const nextLevel = computed(() => (card.value?.levels || []).find((item) => item.level === (focus.value?.level || 0) + 1) || null);
const floor = computed(() => Number(focus.value?.growth || 0));
const span = computed(() => {
  if (!nextLevel.value) return Math.max(1, floor.value);
  return Math.max(1, nextLevel.value.growth - floor.value);
});
const into = computed(() => {
  if (!card.value || !focus.value) return 0;
  if (focus.value.level < card.value.level) return span.value;
  if (focus.value.level > card.value.level) return 0;
  return Math.max(0, Math.min(span.value, card.value.growth - floor.value));
});
const bar = computed(() => Math.round((into.value / span.value) * 100));
const pill = computed(() => {
  if (!card.value || !focus.value) return "";
  if (!nextLevel.value && focus.value.level <= card.value.level) return "已满级";
  if (focus.value.level < card.value.level) return "已达到";
  if (focus.value.level > card.value.level) return `升级${focus.value.code}`;
  return `升级${card.value.nextCode}`;
});
const nowLine = computed(() => {
  if (!card.value || !focus.value) return "";
  if (focus.value.level === card.value.level) return `当前等级 · ${card.value.name}`;
  return `${focus.value.code} · ${focus.value.name}`;
});

onMounted(async () => {
  setChrome("会员中心", "按出行成长");
  if (!requireLogin(store, router, route)) return;
  await store.fetchMe().catch(() => {});
  focus.value = card.value?.levels?.find((item) => item.current) || card.value?.levels?.[0] || null;
});
</script>

<style scoped>
.member-hero {
  position: relative;
  padding: 18px 16px 16px;
  border-radius: 18px;
  background: linear-gradient(180deg, #f3e9ff 0%, #f7f2fc 70%, #fbf9fe 100%);
  color: #3a1848;
  overflow: hidden;
  min-height: 168px;
}
.member-codes { display: flex; gap: 8px; padding-right: 28px; }
.member-codes button { flex: 1; border: 0; background: transparent; color: #b7a8c6; font: inherit; font-size: 13px; padding: 0; }
.member-codes .on { color: #5c2d82; font-weight: 800; }
.member-next {
  position: absolute;
  right: 2px;
  top: 86px;
  z-index: 2;
  border: 0;
  background: transparent;
  color: #b9a8c8;
  font-size: 22px;
  line-height: 1;
  padding: 8px;
}
.member-now { margin: 22px 0 0; font-size: 12px; color: #8d7a9e; position: relative; z-index: 2; }
.member-hero h2 { margin: 2px 0 0; font-size: 32px; letter-spacing: 0.5px; position: relative; z-index: 2; }
.member-mark {
  position: absolute;
  right: 0;
  top: 16px;
  z-index: 0;
  width: 146px;
  height: 118px;
  object-fit: contain;
  pointer-events: none;
}
.member-meter { display: flex; align-items: center; gap: 8px; margin-top: 14px; position: relative; z-index: 2; }
.member-meter span { font-size: 13px; white-space: nowrap; }
.member-meter b { font-size: 16px; }
.member-track {
  position: relative;
  width: 108px;
  height: 8px;
  border-radius: 99px;
  background: #eadcf6;
}
.member-track i {
  display: block;
  height: 8px;
  border-radius: 99px;
  background: linear-gradient(90deg, #c9a2e6, #7a3d9a);
}
.member-track em {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  background: #7a3d9a;
  color: #fff;
  font-style: normal;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 8px;
}
.member-month { margin: 12px 0 0; font-size: 13px; color: #6d6278; position: relative; z-index: 1; }
.member-perk-head { text-align: center; color: #6b2178; }
.member-perks { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.member-perks div { background: #fff; border-radius: 12px; padding: 14px; font-weight: 650; }
</style>
