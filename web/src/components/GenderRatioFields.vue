<template>
  <div class="gender-ratio">
    <div class="gender-head">
      <el-switch :model-value="!!model.on && !schoolMode" :disabled="schoolMode" @change="setOn" />
      <span>全团</span>
    </div>
    <p class="gender-note">{{ note }}</p>
    <div class="ratio-card" :class="{ off: !model.on || schoolMode }">
      <div class="ratio-figures">
        <div class="ratio-fig"><span>男生</span><strong>{{ share(model.overall) }}</strong></div>
        <div class="ratio-fig end"><span>女生</span><strong>{{ 100 - share(model.overall) }}</strong></div>
      </div>
      <el-slider
        :model-value="share(model.overall)"
        :min="0"
        :max="100"
        :disabled="!model.on || schoolMode"
        :format-tooltip="tip"
        @input="setOverallPercent"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from "vue";
import { maleShare, syncGenderRatio } from "@/utils/genderRatio";

const model = defineModel({ type: Object, required: true });
const props = defineProps({
  targets: { type: Array, default: () => [] },
});

watch(
  () => JSON.stringify(props.targets || []),
  () => {
    model.value = syncGenderRatio(model.value, props.targets);
  },
  { immediate: true }
);

const schoolMode = computed(() => ((model.value && model.value.schools) || []).some((row) => row.on));
const note = computed(() => {
  if (schoolMode.value) return "已按学校设置，不能再设全团。";
  if (model.value && model.value.on) return "已按全团设置。学校不再单独设置。";
  return "男生名额按 100 计。";
});

function share(row) {
  const src = row || {};
  return maleShare(src.male, src.female);
}

function tip(value) {
  return `男生 ${value}，女生 ${100 - value}`;
}

function pair(value) {
  const male = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
  return { male, female: 100 - male };
}

function setOn(on) {
  if (schoolMode.value) return;
  const next = syncGenderRatio(model.value, props.targets);
  next.on = !!on;
  model.value = next;
}

function setOverallPercent(value) {
  if (schoolMode.value) return;
  const next = syncGenderRatio({ ...model.value, overall: pair(value) }, props.targets);
  next.on = true;
  model.value = next;
}
</script>

<style scoped>
.gender-ratio { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.gender-head { display: flex; align-items: center; gap: 10px; font-weight: 600; }
.gender-note { margin: 0; color: #8e8e93; font-size: 13px; line-height: 1.45; font-weight: 400; }
.ratio-card { padding: 14px 14px 2px; border: 1px solid #d9d9d9; border-radius: 12px; background: rgba(0, 0, 0, 0.03); }
.ratio-kicker { color: #1c1c1e; font-size: 15px; font-weight: 600; line-height: 1.3; }
.ratio-meta { margin-top: 2px; color: #8e8e93; font-size: 12px; }
.ratio-figures { display: flex; justify-content: space-between; margin-top: 12px; }
.ratio-fig { display: flex; flex-direction: column; gap: 2px; }
.ratio-fig.end { align-items: flex-end; }
.ratio-fig span { color: #8e8e93; font-size: 12px; font-weight: 400; }
.ratio-fig strong { color: #1c1c1e; font-size: 28px; font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; }
.ratio-card :deep(.el-slider) {
  --el-slider-main-bg-color: rgba(0, 0, 0, 0.35);
  --el-slider-runway-bg-color: rgba(0, 0, 0, 0.10);
}
.ratio-card :deep(.el-slider__button) {
  border-color: rgba(0, 0, 0, 0.28);
  background: rgba(255, 255, 255, 0.92);
}
.off { opacity: 0.45; }
</style>
