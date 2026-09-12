<template>
  <nav class="goods-tabs" role="tablist" :aria-label="label">
    <button
      v-for="t in tabs"
      :key="t.id"
      type="button"
      role="tab"
      :aria-selected="t.id === modelValue"
      :class="{ on: t.id === modelValue }"
      @click="$emit('update:modelValue', t.id)"
    >
      {{ t.label }}
    </button>
  </nav>
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: "" },
  tabs: { type: Array, default: () => [] },
  label: { type: String, default: "详情分段" },
});
defineEmits(["update:modelValue"]);
</script>
