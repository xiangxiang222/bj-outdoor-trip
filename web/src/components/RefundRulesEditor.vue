<template>
  <div class="refund-editor">
    <div v-for="(t, i) in model" :key="i" class="refund-row">
      <span>出发前</span>
      <el-input-number v-model="t.minDays" :min="0" :max="365" :step="1" :disabled="disabled" controls-position="right" @change="emit" />
      <span>天及以上，退</span>
      <el-input-number v-model="t.percent" :min="0" :max="100" :step="1" :disabled="disabled" controls-position="right" @change="emit" />
      <span>%</span>
      <el-button v-if="!disabled && model.length > 1" link type="danger" @click="remove(i)">删除</el-button>
    </div>
    <el-button v-if="!disabled" @click="add">加一档</el-button>
    <p class="muted hint">请保留一档「0 天」，用于出发当天尚未正式开团。正式开团后一律不退费。</p>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
});
const emitUpdate = defineEmits(["update:modelValue"]);

const model = computed(() => props.modelValue || []);

function emit() {
  emitUpdate("update:modelValue", model.value.map((t) => ({ minDays: Number(t.minDays) || 0, percent: Number(t.percent) || 0 })));
}

function add() {
  const last = model.value[model.value.length - 1];
  const next = [...model.value, { minDays: last ? Math.max(0, Number(last.minDays) - 1) : 0, percent: last ? Math.max(0, Number(last.percent) - 10) : 50 }];
  emitUpdate("update:modelValue", next);
}

function remove(i) {
  emitUpdate(
    "update:modelValue",
    model.value.filter((_, idx) => idx !== i)
  );
}
</script>

<style scoped>
.refund-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.hint { margin: 8px 0 0; }
</style>
