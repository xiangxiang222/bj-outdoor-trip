<template>
  <div class="gender-ratio">
    <div class="gender-head">
      <div class="gender-copy">
        <span>男女比例</span>
        <small>{{ note }}</small>
      </div>
      <el-switch :model-value="!!model.on && !schoolMode" :disabled="schoolMode" @change="setOn" />
    </div>
    <div v-if="model.on && !schoolMode" class="ratio-panel">
      <div class="ratio-figures">
        <div class="ratio-fig"><span>男生</span><strong>{{ share(model.overall) }}</strong></div>
        <div class="ratio-fig end"><span>女生</span><strong>{{ 100 - share(model.overall) }}</strong></div>
      </div>
      <el-slider
        :model-value="share(model.overall)"
        :min="0"
        :max="100"
        :format-tooltip="tip"
        @input="setOverallPercent"
      />
      <p class="gender-foot">男生和女生合计 100。学校不再单独设置。</p>
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
  if (schoolMode.value) return "已按学校设置";
  if (model.value && model.value.on) return "按全团计算";
  return "不限制";
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
.gender-ratio { width: 100%; }
.gender-head { display: flex; align-items: center; gap: 12px; min-height: 52px; }
.gender-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.gender-copy span { color: #1c1c1e; font-weight: 600; }
.gender-copy small { color: #8e8e93; font-size: 12px; font-weight: 400; line-height: 1.3; }
.ratio-panel { padding-bottom: 8px; }
.ratio-figures { display: flex; justify-content: space-between; }
.ratio-fig { display: flex; flex-direction: column; gap: 2px; }
.ratio-fig.end { align-items: flex-end; }
.ratio-fig span { color: #8e8e93; font-size: 12px; font-weight: 400; }
.ratio-fig strong { color: #1c1c1e; font-size: 28px; font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; }
.gender-foot { margin: 0; color: #8e8e93; font-size: 12px; line-height: 1.4; }
.ratio-panel :deep(.el-slider) {
  --el-slider-main-bg-color: rgba(0, 0, 0, 0.35);
  --el-slider-runway-bg-color: rgba(0, 0, 0, 0.10);
}
.ratio-panel :deep(.el-slider__button) {
  border-color: rgba(0, 0, 0, 0.28);
  background: rgba(255, 255, 255, 0.92);
}
</style>
