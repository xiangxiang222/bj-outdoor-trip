<template>
  <div v-if="school" class="school-ratio">
    <div class="school-ratio-head">
      <span>男女比例</span>
      <el-switch :model-value="rowOn" :disabled="globalOn" @change="toggle" />
    </div>
    <div v-if="rowOn" class="ratio-card">
      <div class="ratio-figures">
        <div class="ratio-fig"><span>男生</span><strong>{{ share }}</strong></div>
        <div class="ratio-fig end"><span>女生</span><strong>{{ 100 - share }}</strong></div>
      </div>
      <el-slider :model-value="share" :min="0" :max="100" :format-tooltip="tip" @input="setPercent" />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { maleShare, setSchoolRatioOn, setSchoolShare } from "@/utils/genderRatio";

const ratio = defineModel({ type: Object, required: true });
const props = defineProps({
  school: { type: String, default: "" },
});

const row = computed(() => ((ratio.value && ratio.value.schools) || []).find((item) => item.school === props.school));
const rowOn = computed(() => !!(row.value && row.value.on));
const globalOn = computed(() => !!(ratio.value && ratio.value.on));
const share = computed(() => maleShare(row.value && row.value.male, row.value && row.value.female));

function tip(value) {
  return `男生 ${value}，女生 ${100 - value}`;
}

function toggle(on) {
  if (globalOn.value) return;
  ratio.value = setSchoolRatioOn(ratio.value, props.school, on);
}

function setPercent(value) {
  if (globalOn.value) return;
  ratio.value = setSchoolShare(ratio.value, props.school, value);
}
</script>

<style scoped>
.school-ratio { margin-top: 8px; }
.school-ratio-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-weight: 600; }
.ratio-card { margin-top: 8px; }
.ratio-figures { display: flex; justify-content: space-between; }
.ratio-fig { display: flex; flex-direction: column; gap: 2px; }
.ratio-fig.end { align-items: flex-end; }
.ratio-fig span { color: #8e8e93; font-size: 12px; font-weight: 400; }
.ratio-fig strong { color: #1c1c1e; font-size: 28px; font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; }
.school-ratio :deep(.el-slider) {
  --el-slider-main-bg-color: rgba(0, 0, 0, 0.35);
  --el-slider-runway-bg-color: rgba(0, 0, 0, 0.10);
}
.school-ratio :deep(.el-slider__button) {
  border-color: rgba(0, 0, 0, 0.28);
  background: rgba(255, 255, 255, 0.92);
}
</style>
