<template>
  <span v-if="meta" class="trip-kind" :class="meta.key" :title="meta.label">
    <i class="trip-kind-ico" aria-hidden="true" />
    {{ meta.label }}
  </span>
</template>

<script setup>
import { computed } from "vue";
import { tripKindMeta } from "@/utils/labels";

const props = defineProps({
  type: { type: String, default: "" },
  channel: { type: String, default: "" },
  kind: { type: String, default: "" },
});

const meta = computed(() => tripKindMeta(props.kind || props.type, props.channel));
</script>
