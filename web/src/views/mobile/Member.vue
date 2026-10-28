<template>
  <LoadRow v-if="!card && !memberChecked" />
  <p v-else-if="!card" class="muted pad">加载失败</p>
  <div v-else class="member-page">
    <section class="member-hero" aria-label="当前会员等级">
      <div class="member-hero-top">
        <div class="member-identity">
          <p class="member-eyebrow">同行者众会员</p>
          <h2>{{ card.name }}</h2>
          <span class="member-code">{{ card.code }} <i>当前等级</i></span>
        </div>
        <img class="member-mark" :src="'/static/member/v' + card.level + '.png'" alt="" />
      </div>
      <div class="member-growth">
        <div class="member-growth-heading">
          <span>累计成长值</span>
          <strong>{{ card.growth }}</strong>
        </div>
        <div class="member-track" role="progressbar" :aria-valuenow="Math.round(card.progress * 100)" aria-valuemin="0" aria-valuemax="100" :aria-label="card.nextName ? '升级进度至 ' + card.nextName : '已达到最高等级'">
          <i :style="{ width: ((card.progress || 0) * 100) + '%' }"></i>
        </div>
        <p v-if="card.nextCode" class="member-next-level"><span>距离下一级还需</span> <b>{{ card.nextGrowth > card.growth ? card.nextGrowth - card.growth : 0 }}</b> <span>成长值</span></p>
        <p v-else class="member-next-level">已达到最高等级</p>
      </div>
      <p class="member-month">本月新增 <strong>{{ card.monthGrowth }}</strong> 成长值</p>
    </section>

    <section class="member-level-section" aria-label="会员等级">
      <div class="member-section-heading">
        <div>
          <h3>会员等级</h3>
          <p>查看不同等级的权益</p>
        </div>
        <span class="member-current-label">当前 {{ card.code }}</span>
      </div>
      <div class="member-codes">
        <button
          v-for="item in card.levels"
          :key="item.level"
          type="button"
          :class="{ selected: focus?.level === item.level, current: item.current, reached: item.reached }"
          :aria-pressed="focus?.level === item.level"
          :aria-label="item.code + ' ' + item.name + (item.current ? '，当前等级' : '，查看权益')"
          @click="focus = item"
        >
          <span class="member-tier-code">{{ item.code }}</span>
          <span class="member-tier-state">{{ item.current ? '当前' : focus?.level === item.level ? '预览' : item.reached ? '已达' : '未达' }}</span>
        </button>
      </div>
    </section>

    <section class="member-benefits" aria-label="会员权益">
      <div class="member-section-heading">
        <div>
          <h3>{{ focus?.level === card.level ? '当前等级权益' : focus?.name + '权益预览' }}</h3>
          <p>{{ focus?.level === card.level ? '本等级可享内容' : '预览等级，不代表已获得' }}</p>
        </div>
        <span class="member-benefit-count">{{ focus?.perks?.length || 0 }} 项</span>
      </div>
      <div class="member-perks">
        <div v-for="perk in focus?.perks || []" :key="perk" class="member-perk">
          <span class="member-perk-marker" aria-hidden="true"></span>
          <span>{{ perk }}</span>
        </div>
      </div>
    </section>
    <p class="member-note">出行可累积成长值，等级与权益以当前账户展示为准。</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { setChrome } from "@/utils/pageChrome";
import LoadRow from "@/components/LoadRow.vue";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const focus = ref(null);
const memberChecked = ref(!!store.profile?.membership);

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
  memberChecked.value = true;
  focus.value = card.value?.levels?.find((item) => item.current) || card.value?.levels?.[0] || null;
});
</script>

<style scoped>
.member-page {
  margin: -12px -14px -16px;
  padding: 12px 12px 24px;
  min-width: 0;
  min-height: 100%;
  overflow: hidden;
  background: linear-gradient(180deg, #f4eefb 0, #faf9fc 280px, var(--cream) 100%);
  color: var(--ink);
  font-family: "PingFang SC", "Helvetica Neue", "Noto Sans SC", sans-serif;
  --member-accent: #5b3b8c;
  --member-accent-soft: #eee6f7;
  --member-rule: rgba(91, 59, 140, .14);
  --member-hero-start: #e4d8f3;
  --member-hero-middle: #eee7f8;
  --member-hero-end: #f6f1fb;
  --member-perk-bg: #faf8fc;
}
.member-hero {
  position: relative;
  padding: 20px 18px 15px;
  border: 1px solid rgba(255, 255, 255, .86);
  border-radius: 18px;
  background: linear-gradient(145deg, var(--member-hero-start) 0%, var(--member-hero-middle) 52%, var(--member-hero-end) 100%);
  color: var(--ink);
  overflow: hidden;
  box-shadow: 0 10px 28px rgba(69, 45, 101, .08);
}
.member-hero-top {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 136px;
  padding-right: 112px;
}
.member-identity { position: relative; z-index: 1; min-width: 0; }
.member-eyebrow {
  margin: 0 0 10px;
  color: var(--member-accent);
  font-size: calc(12px * var(--ui-scale));
  font-weight: 600;
}
.member-identity h2 {
  margin: 0;
  color: var(--member-accent);
  font-size: calc(27px * var(--ui-scale));
  font-weight: 700;
  line-height: 1.2;
}
.member-code {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 10px;
  color: var(--member-accent);
  font-size: calc(12px * var(--ui-scale));
  font-weight: 600;
}
.member-code i {
  border-left: 1px solid var(--member-rule);
  padding-left: 7px;
  color: var(--muted);
  font-size: calc(11px * var(--ui-scale));
  font-style: normal;
  font-weight: 400;
}
.member-mark {
  position: absolute;
  right: -4px;
  top: 0;
  width: 138px;
  height: 132px;
  object-fit: contain;
  object-position: center;
  pointer-events: none;
}
.member-growth {
  position: relative;
  z-index: 1;
  padding-top: 13px;
  border-top: 1px solid rgba(91, 59, 140, .13);
}
.member-growth-heading {
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: var(--muted);
  font-size: calc(12px * var(--ui-scale));
}
.member-growth-heading strong {
  color: var(--member-accent);
  font-size: calc(22px * var(--ui-scale));
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.member-track {
  width: 100%;
  height: 7px;
  margin-top: 9px;
  overflow: hidden;
  border-radius: 99px;
  background: rgba(91, 59, 140, .14);
}
.member-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #a789c8, var(--member-accent));
  transition: width .25s ease;
}
.member-next-level {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: calc(11px * var(--ui-scale));
}
.member-next-level b { color: var(--member-accent); font-weight: 700; }
.member-month {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: calc(11px * var(--ui-scale));
}
.member-month strong { color: var(--member-accent); font-weight: 600; }
.member-level-section,
.member-benefits {
  min-width: 0;
  margin-top: 16px;
  padding: 16px 14px 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--paper);
}
.member-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}
.member-section-heading h3 {
  margin: 0;
  color: var(--ink);
  font-size: calc(15px * var(--ui-scale));
  font-weight: 650;
  line-height: 1.3;
}
.member-section-heading p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: calc(11px * var(--ui-scale));
}
.member-current-label,
.member-benefit-count {
  flex: 0 0 auto;
  color: var(--member-accent);
  font-size: calc(11px * var(--ui-scale));
  font-weight: 600;
}
.member-codes {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  margin-top: 14px;
}
.member-codes button {
  display: flex;
  min-width: 0;
  min-height: 54px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 1px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.member-codes button.selected {
  border-color: var(--member-rule);
  background: var(--member-accent-soft);
  color: var(--member-accent);
}
.member-codes button.current:not(.selected) { color: var(--member-accent); }
.member-tier-code {
  font-size: calc(13px * var(--ui-scale));
  font-weight: 700;
  line-height: 1;
}
.member-tier-state {
  color: var(--muted);
  font-size: calc(10px * var(--ui-scale));
  line-height: 1.2;
  white-space: nowrap;
}
.member-codes button.current .member-tier-state { color: var(--member-accent); }
.member-perks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  min-width: 0;
  margin-top: 13px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.member-perks::-webkit-scrollbar { display: none; }
.member-perk {
  display: flex;
  min-width: 0;
  min-height: 54px;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--member-perk-bg);
  color: var(--ink);
  font-size: calc(13px * var(--ui-scale));
  font-weight: 550;
  line-height: 1.35;
}
.member-perk-marker {
  flex: 0 0 3px;
  align-self: stretch;
  border-radius: 99px;
  background: var(--member-accent);
  opacity: .7;
}
.member-note {
  margin: 13px 4px 0;
  color: var(--muted);
  font-size: calc(11px * var(--ui-scale));
  line-height: 1.5;
}
html[data-night="dark"] .member-page {
  --member-accent: #c8a9e9;
  --member-accent-soft: #3b2b48;
  --member-rule: rgba(200, 169, 233, .2);
  --member-hero-start: #392b48;
  --member-hero-middle: #31253d;
  --member-hero-end: #2a2032;
  --member-perk-bg: #302638;
  background: linear-gradient(180deg, #2a2032 0, #211925 300px, var(--cream) 100%);
}
html[data-night="dark"] .member-hero {
  border-color: rgba(255, 255, 255, .07);
  box-shadow: 0 10px 26px rgba(0, 0, 0, .18);
}
@media (max-width: 360px) {
  .member-page { padding-right: 10px; padding-left: 10px; }
  .member-hero { padding-right: 14px; padding-left: 14px; }
  .member-hero-top { padding-right: 100px; }
  .member-mark { right: -10px; width: 126px; height: 122px; }
  .member-level-section, .member-benefits { padding-right: 11px; padding-left: 11px; }
  .member-codes { gap: 3px; }
}
</style>
