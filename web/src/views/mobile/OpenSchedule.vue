<template>
  <PublishView :key="routeId" :fixed-route-id="routeId" />
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import PublishView from "@/views/mobile/Publish.vue";

const route = useRoute();
const routeId = computed(() => {
  const id = Number(route.params.id);
  return Number.isInteger(id) && id > 0 ? id : 0;
});
</script>
