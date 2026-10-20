<template>
  <div v-if="rows.length" class="payer-list">
    <div class="payer-title">帮忙支付</div>
    <div v-for="(p, i) in rows" :key="(p.createdAt || '') + '-' + i" class="payer-row">
      <div>
        <div>{{ p.self ? "你" : p.nickname }}</div>
        <div v-if="p.remark" class="muted">{{ p.remark }}</div>
      </div>
      <b class="payer-amt">¥{{ p.amount }}</b>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  list: { type: Array, default: () => [] },
});
const rows = computed(() => (Array.isArray(props.list) ? props.list : []));
</script>
