<template>
  <div class="gender-ratio">
    <div class="gender-head">
      <el-switch :model-value="!!model.on" @change="setOn" />
      <span>限制男女比例</span>
    </div>
    <p class="gender-note">男生名额按 100 计。</p>
    <div class="ratio-card" :class="{ off: !model.on }">
      <div class="ratio-kicker">全团</div>
      <div class="ratio-figures">
        <div class="ratio-fig"><span>男生</span><strong>{{ share(model.overall) }}</strong></div>
        <div class="ratio-fig end"><span>女生</span><strong>{{ 100 - share(model.overall) }}</strong></div>
      </div>
      <el-slider
        :model-value="share(model.overall)"
        :min="0"
        :max="100"
        :disabled="!model.on"
        :format-tooltip="tip"
        @input="setOverallPercent"
      />
    </div>
    <div v-for="(row, i) in model.schools" :key="'s' + row.school" class="ratio-card" :class="{ off: !model.on }">
      <div class="ratio-kicker">{{ row.school }}</div>
      <div class="ratio-figures">
        <div class="ratio-fig"><span>男生</span><strong>{{ share(row) }}</strong></div>
        <div class="ratio-fig end"><span>女生</span><strong>{{ 100 - share(row) }}</strong></div>
      </div>
      <el-slider :model-value="share(row)" :min="0" :max="100" :disabled="!model.on" :format-tooltip="tip" @input="setRowPercent('schools', i, $event)" />
    </div>
    <div v-for="(row, i) in model.colleges" :key="'c' + row.school + row.college" class="ratio-card" :class="{ off: !model.on }">
      <div class="ratio-kicker">{{ row.college }}</div>
      <div class="ratio-meta">{{ row.school }}</div>
      <div class="ratio-figures">
        <div class="ratio-fig"><span>男生</span><strong>{{ share(row) }}</strong></div>
        <div class="ratio-fig end"><span>女生</span><strong>{{ 100 - share(row) }}</strong></div>
      </div>
      <el-slider :model-value="share(row)" :min="0" :max="100" :disabled="!model.on" :format-tooltip="tip" @input="setRowPercent('colleges', i, $event)" />
    </div>
    <p v-if="(model.schools && model.schools.length) || (model.colleges && model.colleges.length)" class="gender-note">全团限制始终生效。学校与学院可另行设置。</p>
  </div>
</template>

<script setup>
import { watch } from "vue";
import { maleShare, syncGenderRatio } from "@/utils/genderRatio";

const model = defineModel({ type: Object, required: true });
const props = defineProps({
  targets: { type: Array, default: () => [] },
});

watch(
  () => JSON.stringify(props.targets || []),
  () => {
    const next = syncGenderRatio(model.value, props.targets);
    next.on = !!(model.value && model.value.on);
    model.value = next;
  },
  { immediate: true }
);

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
  const next = syncGenderRatio(model.value, props.targets);
  next.on = !!on;
  model.value = next;
}

function setOverallPercent(value) {
  const next = syncGenderRatio({ ...model.value, overall: pair(value) }, props.targets);
  next.on = true;
  model.value = next;
}

function setRowPercent(key, index, value) {
  const rows = (model.value[key] || []).slice();
  const current = rows[index] || {};
  rows[index] = { ...current, ...pair(value), on: true };
  model.value = { ...model.value, on: true, [key]: rows };
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
