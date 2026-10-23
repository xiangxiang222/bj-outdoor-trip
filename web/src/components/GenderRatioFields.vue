<template>
  <div class="gender-ratio">
    <div class="gender-head">
      <el-switch :model-value="!!model.on" @change="setOn" />
      <span>限制男女比例</span>
    </div>
    <p class="gender-note">打开后按座位算出名额。1 比 1、30 座，男生和女生最多各 15 人。</p>
    <div class="ratio-box">
      <strong>全团</strong>
      <div class="ratio-line">
        <span>男</span>
        <el-input-number :model-value="model.overall.male" :min="0" :max="99" :disabled="!model.on" @change="setOverall('male', $event)" />
      </div>
      <div class="ratio-line">
        <span>女</span>
        <el-input-number :model-value="model.overall.female" :min="0" :max="99" :disabled="!model.on" @change="setOverall('female', $event)" />
      </div>
    </div>
    <template v-if="model.on">
      <div v-for="(row, i) in model.schools" :key="'s' + row.school" class="ratio-block">
        <div class="gender-head">
          <el-switch :model-value="!!row.on" @change="setRow('schools', i, { on: $event })" />
          <span>{{ row.school }}</span>
        </div>
        <div v-if="row.on" class="ratio-box">
          <div class="ratio-line">
            <span>男</span>
            <el-input-number :model-value="row.male" :min="0" :max="99" @change="setRow('schools', i, { male: $event })" />
          </div>
          <div class="ratio-line">
            <span>女</span>
            <el-input-number :model-value="row.female" :min="0" :max="99" @change="setRow('schools', i, { female: $event })" />
          </div>
        </div>
      </div>
      <div v-for="(row, i) in model.colleges" :key="'c' + row.school + row.college" class="ratio-block">
        <div class="gender-head">
          <el-switch :model-value="!!row.on" @change="setRow('colleges', i, { on: $event })" />
          <span>{{ row.school }} · {{ row.college }}</span>
        </div>
        <div v-if="row.on" class="ratio-box">
          <div class="ratio-line">
            <span>男</span>
            <el-input-number :model-value="row.male" :min="0" :max="99" @change="setRow('colleges', i, { male: $event })" />
          </div>
          <div class="ratio-line">
            <span>女</span>
            <el-input-number :model-value="row.female" :min="0" :max="99" @change="setRow('colleges', i, { female: $event })" />
          </div>
        </div>
      </div>
      <p v-if="!model.schools.length && !model.colleges.length" class="gender-note">报名范围里有两所以上学校，或同一学校有两个以上学院时，可以再单独限制。</p>
    </template>
  </div>
</template>

<script setup>
import { watch } from "vue";
import { syncGenderRatio } from "@/utils/genderRatio";

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

function setOn(on) {
  const next = syncGenderRatio(model.value, props.targets);
  next.on = !!on;
  model.value = next;
}

function setOverall(side, value) {
  const overall = { ...(model.value.overall || { male: 1, female: 1 }) };
  const nextValue = value == null || value === "" ? 0 : Number(value);
  const other = side === "male" ? overall.female : overall.male;
  overall[side] = nextValue === 0 && Number(other) === 0 ? 1 : nextValue;
  const next = syncGenderRatio({ ...model.value, overall }, props.targets);
  next.on = true;
  model.value = next;
}

function setRow(key, index, patch) {
  const rows = (model.value[key] || []).slice();
  rows[index] = { ...rows[index], ...patch };
  model.value = { ...model.value, [key]: rows };
}
</script>

<style scoped>
.gender-ratio { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.gender-head { display: flex; align-items: center; gap: 10px; font-weight: 600; }
.gender-note { margin: 0; color: #8d8d8d; font-size: 13px; line-height: 1.5; font-weight: 400; }
.ratio-block { padding: 10px 12px; border: 1px solid #f0d4d6; border-radius: 12px; background: #fff; }
.ratio-box { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.ratio-line { display: flex; align-items: center; gap: 8px; }
.ratio-line :deep(.el-input-number) { width: 120px; }
</style>
