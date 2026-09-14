<template>
  <div class="admin-campus-targets">
    <div v-for="(row, i) in model" :key="i" class="admin-campus-target-row">
      <CampusCatalogSelect
        :model-value="row.school"
        kind="school"
        placeholder="学校"
        @update:model-value="setSchool(i, $event)"
      />
      <CampusCatalogSelect
        :model-value="row.college"
        kind="college"
        :school="row.school"
        :disabled="!row.school"
        :placeholder="row.school ? '学院可空' : '请先选学校'"
        @update:model-value="setCollege(i, $event)"
      />
      <CampusCatalogSelect
        :model-value="row.major"
        kind="major"
        :school="row.school"
        :college="row.college"
        :disabled="!row.college"
        :placeholder="row.college ? '专业可空' : '请先选学院'"
        @update:model-value="setMajor(i, $event)"
      />
      <el-button @click="remove(i)">删除</el-button>
    </div>
    <el-button @click="add">添加学校-学院-专业</el-button>
    <p class="muted" style="margin:8px 0 0">每条是一组绑定关系。两校都有计算机学院时，要分别添加，不会混成同一个学院名。</p>
  </div>
</template>

<script setup>
import CampusCatalogSelect from "@/components/admin/CampusCatalogSelect.vue";
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
.admin-campus-target-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}
</style>
