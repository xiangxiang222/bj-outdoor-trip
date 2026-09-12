<template>
  <div class="lw">
    <div class="lw-stage">
      <div class="lw-pointer" aria-hidden="true" />
      <div
        class="lw-disc"
        :class="{ spinning }"
        :style="{
          background: conic,
          transform: `rotate(${deg}deg)`,
          transition: spinning ? `transform ${seconds}s cubic-bezier(0.12, 0.7, 0.12, 1)` : 'none',
        }"
      >
        <div
          v-for="(p, i) in prizes"
          :key="p.key || i"
          class="lw-label"
          :style="labelStyle(i)"
        >{{ short(p.label) }}</div>
        <div class="lw-hub" />
      </div>
      <button class="lw-go" type="button" :disabled="disabled || spinning" @click="request">
        {{ spinning ? "…" : goText }}
      </button>
    </div>
    <div class="lw-legend">
      <span v-for="(p, i) in prizes" :key="(p.key || i) + '-lg'" class="lw-chip">
        <i :style="{ background: p.color || '#ccc' }" />{{ p.label }}
      </span>
    </div>
    <div v-if="fx" class="lw-mask" @click="fx = null">
      <div class="lw-burst" :class="'lv' + fxLevel" />
      <div class="lw-card" :class="'lv' + fxLevel" @click.stop>
        <em>{{ fxTitle }}</em>
        <strong>{{ fx.prizeLabel }}</strong>
        <p v-if="fx.prizeInfo && fxLevel < 9">奖品：{{ fx.prizeInfo }}</p>
        <p v-if="fx.rate != null && fxLevel < 9">这档中奖率 {{ fx.rate }}%</p>
        <p v-if="fx.doubled">两次奖品一致，领取时翻倍</p>
        <p v-else-if="fxLevel >= 9" class="muted">下次再来</p>
        <p v-else-if="fx.claimHint" class="muted">{{ fx.claimHint }}</p>
        <p v-else class="muted">已记入你的账户</p>
        <button class="btn block" type="button" @click="fx = null">好的</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";

const props = defineProps({
  prizes: { type: Array, default: () => [] },
  spinSeconds: { type: Number, default: 5 },
  disabled: { type: Boolean, default: false },
  goText: { type: String, default: "抽奖" },
  parkKey: { type: String, default: "" },
});

const emit = defineEmits(["request"]);

const deg = ref(0);
const spinning = ref(false);
const fx = ref(null);

const seconds = computed(() => {
  const n = Number(props.spinSeconds || 5);
  return n >= 2 && n <= 10 ? n : 5;
});

const conic = computed(() => {
  const list = props.prizes || [];
  if (!list.length) return "#eee";
  const slice = 360 / list.length;
  const stops = list.map((p, i) => {
    const color = p.color || ["#e1251b", "#f5a623", "#7cb342", "#42a5f5", "#26a69a", "#c8ccc4"][i % 6];
    return `${color} ${i * slice}deg ${(i + 1) * slice}deg`;
  });
  return `conic-gradient(from 0deg, ${stops.join(",")})`;
});

const fxLevel = computed(() => Number(fx.value?.level || 9));
const fxTitle = computed(() => {
  const lv = fxLevel.value;
  if (lv <= 1) return "恭喜一等奖";
  if (lv === 2) return "恭喜二等奖";
  if (lv === 3) return "恭喜三等奖";
  if (lv >= 9) return "谢谢参与";
  return "中奖啦";
});

function short(label) {
  const t = String(label || "");
  return t.length > 6 ? t.slice(0, 6) : t;
}

function labelStyle(i) {
  const n = Math.max(props.prizes.length, 1);
  const slice = 360 / n;
  const angle = (i + 0.5) * slice;
  return { transform: `rotate(${angle}deg) translateY(-104px) rotate(${-angle}deg)` };
}

function sectorDeg(index) {
  const n = Math.max(props.prizes.length, 1);
  const slice = 360 / n;
  return 360 - (Number(index) + 0.5) * slice;
}

function park(key) {
  if (!key || !props.prizes.length) return;
  const i = props.prizes.findIndex((p) => p.key === key);
  if (i < 0) return;
  spinning.value = false;
  deg.value = sectorDeg(i);
}

function request() {
  if (props.disabled || spinning.value) return;
  emit("request");
}

function play(result) {
  if (!result) return Promise.resolve();
  const index = Number(result.sectorIndex);
  const safe = Number.isFinite(index) ? index : props.prizes.findIndex((p) => p.key === result.prizeKey);
  const wait = result.already ? 0.35 : seconds.value;
  spinning.value = true;
  const extra = result.already ? 1 : 6;
  requestAnimationFrame(() => {
    deg.value = extra * 360 + sectorDeg(safe < 0 ? 0 : safe);
  });
  return new Promise((resolve) => {
    window.setTimeout(() => {
      spinning.value = false;
      fx.value = result.already ? null : result;
      resolve(result);
    }, wait * 1000 + 80);
  });
}

watch(
  () => [props.parkKey, props.prizes.length],
  () => park(props.parkKey),
  { immediate: true }
);

onMounted(() => park(props.parkKey));

defineExpose({ play });
</script>

<style scoped>
.lw { position: relative; }
.lw-stage {
  position: relative;
  width: 300px;
  height: 300px;
  margin: 8px auto 16px;
}
.lw-pointer {
  position: absolute;
  left: 50%;
  top: -4px;
  z-index: 3;
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-top: 22px solid #e1251b;
  transform: translateX(-50%);
  filter: drop-shadow(0 2px 2px rgba(0,0,0,.2));
}
.lw-disc {
  width: 300px;
  height: 300px;
  border-radius: 50%;
  box-shadow: 0 0 0 10px #fff, 0 0 0 14px #e8c56b, 0 16px 32px rgba(0,0,0,.12);
  position: relative;
  overflow: hidden;
}
.lw-label {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 72px;
  margin-left: -36px;
  margin-top: -10px;
  text-align: center;
  font-size: 11px;
  line-height: 1.25;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,.45);
  pointer-events: none;
  transform-origin: 50% 10px;
}
.lw-hub {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 72px;
  height: 72px;
  margin: -36px 0 0 -36px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff 0, #f6e7a8 55%, #d4b45a 100%);
  box-shadow: inset 0 0 0 4px #fff;
}
.lw-go {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 4;
  width: 64px;
  height: 64px;
  margin: -32px 0 0 -32px;
  border: 0;
  border-radius: 50%;
  background: #e1251b;
  color: #fff;
  font-weight: 800;
  font-size: 16px;
  box-shadow: 0 6px 16px rgba(225,37,27,.35);
}
.lw-go:disabled { opacity: .55; }
.lw-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  justify-content: center;
  margin-bottom: 8px;
}
.lw-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #5c5f56;
}
.lw-chip i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.lw-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(10, 8, 12, .55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.lw-burst {
  position: absolute;
  width: 240px;
  height: 240px;
  border-radius: 50%;
  pointer-events: none;
}
.lw-burst.lv1 {
  background: radial-gradient(circle, rgba(255,214,80,.55) 0%, rgba(225,37,27,0) 70%);
  animation: lw-pop .6s ease-out;
  box-shadow: 0 0 0 20px rgba(255,214,80,.15), 0 0 80px 20px rgba(255,190,40,.35);
}
.lw-burst.lv2, .lw-burst.lv3 {
  background: radial-gradient(circle, rgba(255,200,120,.4) 0%, transparent 70%);
  animation: lw-pop .5s ease-out;
}
.lw-card {
  position: relative;
  width: min(320px, 100%);
  background: #fff;
  border-radius: 18px;
  padding: 22px 18px 16px;
  text-align: center;
  box-shadow: 0 20px 50px rgba(0,0,0,.25);
}
.lw-card.lv1 { background: linear-gradient(180deg, #fff8e4 0%, #fff 46%); }
.lw-card em {
  display: block;
  font-style: normal;
  font-size: 13px;
  color: #c77d3a;
  margin-bottom: 6px;
}
.lw-card.lv1 em { color: #e1251b; font-weight: 800; }
.lw-card strong { display: block; font-size: 22px; margin-bottom: 8px; }
@keyframes lw-pop {
  from { transform: scale(.4); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
</style>
