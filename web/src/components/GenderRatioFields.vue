<template>
  <div class="gender-ratio">
    <div class="gender-head">
      <el-switch :model-value="!!model.on" @change="setOn" />
      <span>限制男女比例</span>
    </div>
    <p class="gender-note">一共 100。滑块往右，男生占得更多；往左，女生占得更多。50 是对半。30 座、滑到 50，男生和女生最多各 15 人。</p>
    <div class="ratio-slider" :class="{ off: !model.on }">
      <div class="ratio-cap">
        <span>男 {{ share(model.overall) }}</span>
        <strong>全团</strong>
        <span>女 {{ 100 - share(model.overall) }}</span>
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
    <div v-for="(row, i) in model.schools" :key="'s' + row.school" class="ratio-block" :class="{ off: !model.on }">
      <div class="ratio-cap">
        <span>男 {{ share(row) }}</span>
        <strong>{{ row.school }}</strong>
        <span>女 {{ 100 - share(row) }}</span>
      </div>
      <el-slider :model-value="share(row)" :min="0" :max="100" :disabled="!model.on" :format-tooltip="tip" @input="setRowPercent('schools', i, $event)" />
    </div>
    <div v-for="(row, i) in model.colleges" :key="'c' + row.school + row.college" class="ratio-block" :class="{ off: !model.on }">
      <div class="ratio-cap">
        <span>男 {{ share(row) }}</span>
        <strong>{{ row.school }} · {{ row.college }}</strong>
        <span>女 {{ 100 - share(row) }}</span>
      </div>
      <el-slider :model-value="share(row)" :min="0" :max="100" :disabled="!model.on" :format-tooltip="tip" @input="setRowPercent('colleges', i, $event)" />
    </div>
    <p class="gender-note">全团始终要满足。两所以上学校时，每所学校再单独拖一条；同一学校有两个以上学院时，每个学院再单独拖一条。</p>
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
  return `男 ${value} · 女 ${100 - value}`;
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
.gender-note { margin: 0; color: #8d8d8d; font-size: 13px; line-height: 1.5; font-weight: 400; }
.ratio-slider, .ratio-block { width: 100%; }
.ratio-block { padding: 8px 12px 0; border: 1px solid #f0d4d6; border-radius: 12px; background: #fff; }
.ratio-cap { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 13px; }
.ratio-cap strong { font-size: 14px; }
.ratio-slider :deep(.el-slider),
.ratio-block :deep(.el-slider) { --el-slider-main-bg-color: #8c3038; --el-slider-runway-bg-color: #f3c1c6; }
.off { opacity: 0.45; }
</style>
