<template>
  <div class="campus-target-list">
    <div v-for="(row, i) in model" :key="i" class="campus-target-row">
      <CampusNamePicker
        :model-value="row.school"
        kind="school"
        title="选择学校"
        placeholder="学校"
        @update:model-value="setSchool(i, $event)"
      />
      <CampusNamePicker
        :model-value="row.college"
        kind="college"
        :school="row.school"
        :disabled="!row.school"
        title="选择学院"
        :placeholder="row.school ? '学院可空' : '请先选学校'"
        @update:model-value="setCollege(i, $event)"
      />
      <CampusNamePicker
        :model-value="row.major"
        kind="major"
        :school="row.school"
        :college="row.college"
        :disabled="!row.college"
        title="选择专业"
        :placeholder="row.college ? '专业可空' : '请先选学院'"
        @update:model-value="setMajor(i, $event)"
      />
      <button class="btn ghost" type="button" @click="remove(i)">删除</button>
    </div>
    <button class="btn ghost" type="button" @click="add">添加学校-学院-专业</button>
  </div>
</template>

<script setup>
import CampusNamePicker from "@/components/CampusNamePicker.vue";
import { emptyCampusTarget } from "@/utils/campusTargets";

const model = defineModel({ type: Array, default: () => [] });

function setSchool(i, school) {
  const next = model.value.slice();
  next[i] = emptyCampusTarget(school, "", "");
  model.value = next;
}

function setCollege(i, college) {
  const cur = model.value[i] || emptyCampusTarget();
  const next = model.value.slice();
  next[i] = emptyCampusTarget(cur.school, college, "");
  model.value = next;
}

function setMajor(i, major) {
  const cur = model.value[i] || emptyCampusTarget();
  const next = model.value.slice();
  next[i] = emptyCampusTarget(cur.school, cur.college, major);
  model.value = next;
}

function add() {
  model.value = [...model.value, emptyCampusTarget()];
}

function remove(i) {
  model.value = model.value.filter((_, idx) => idx !== i);
}
</script>

<style scoped>
.campus-target-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: 8px;
  margin-bottom: 8px;
  align-items: start;
}
@media (max-width: 520px) {
  .campus-target-row {
    grid-template-columns: 1fr;
  }
}
</style>
