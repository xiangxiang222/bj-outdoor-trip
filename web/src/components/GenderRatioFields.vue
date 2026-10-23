<template>
  <div class="gender-ratio">
    <label class="gender-check">
      <input type="checkbox" :checked="model.on" @change="model = { ...model, on: $event.target.checked }" />
      <span>限制男女比例</span>
    </label>
    <p class="gender-note">按这趟车的座位算。1 比 1、30 座，就是男生和女生最多各 15 人。关掉时不能填。</p>
    <template v-if="model.on">
      <div class="ratio-line">
        <strong>全团</strong>
        <span>男</span>
        <input class="ratio-num" type="number" min="0" max="99" :value="model.overall.male" @input="setOverall('male', $event.target.value)" />
        <span>:</span>
        <span>女</span>
        <input class="ratio-num" type="number" min="0" max="99" :value="model.overall.female" @input="setOverall('female', $event.target.value)" />
      </div>
      <div v-for="(row, i) in model.schools" :key="'s' + row.school" class="ratio-block">
        <label class="gender-check">
          <input type="checkbox" :checked="row.on" @change="setRow('schools', i, { on: $event.target.checked })" />
          <span>{{ row.school }}</span>
        </label>
        <div v-if="row.on" class="ratio-line">
          <span>男</span>
          <input class="ratio-num" type="number" min="0" max="99" :value="row.male" @input="setRow('schools', i, { male: $event.target.value })" />
          <span>:</span>
          <span>女</span>
          <input class="ratio-num" type="number" min="0" max="99" :value="row.female" @input="setRow('schools', i, { female: $event.target.value })" />
        </div>
      </div>
      <div v-for="(row, i) in model.colleges" :key="'c' + row.school + row.college" class="ratio-block">
        <label class="gender-check">
          <input type="checkbox" :checked="row.on" @change="setRow('colleges', i, { on: $event.target.checked })" />
          <span>{{ row.school }} · {{ row.college }}</span>
        </label>
        <div v-if="row.on" class="ratio-line">
          <span>男</span>
          <input class="ratio-num" type="number" min="0" max="99" :value="row.male" @input="setRow('colleges', i, { male: $event.target.value })" />
          <span>:</span>
          <span>女</span>
          <input class="ratio-num" type="number" min="0" max="99" :value="row.female" @input="setRow('colleges', i, { female: $event.target.value })" />
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
    model.value = syncGenderRatio(model.value, props.targets);
  },
  { immediate: true }
);

function setOverall(side, value) {
  model.value = syncGenderRatio(
    { ...model.value, overall: { ...model.value.overall, [side]: value } },
    props.targets
  );
}

function setRow(key, index, patch) {
  const rows = (model.value[key] || []).slice();
  rows[index] = { ...rows[index], ...patch };
  model.value = { ...model.value, [key]: rows };
}
</script>

<style scoped>
.gender-ratio { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.gender-check { display: flex; align-items: flex-start; gap: 8px; font-weight: 600; }
.gender-check input { margin-top: 3px; }
.gender-note { margin: 0; color: #8d8d8d; font-size: 13px; line-height: 1.5; font-weight: 400; }
.ratio-block { padding: 8px 10px; border: 1px solid #f0d4d6; border-radius: 12px; background: #fff; }
.ratio-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ratio-num { width: 72px; padding: 6px 8px; border: 1px solid #e6dfd2; border-radius: 8px; background: #fff; }
</style>
