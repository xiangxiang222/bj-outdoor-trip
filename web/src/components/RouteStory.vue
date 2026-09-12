<template>
  <div v-if="blocks.length" class="route-story">
    <template v-for="(block, i) in blocks" :key="i">
      <p v-if="block.type === 'text'" class="story-text">{{ block.body }}</p>
      <figure v-else-if="block.type === 'image' && block.url" class="story-fig">
        <img :src="block.url" :alt="block.caption || ''" @click="$emit('preview', block.url)" />
        <figcaption v-if="block.caption">{{ block.caption }}</figcaption>
      </figure>
    </template>
  </div>
</template>

<script setup>
defineProps({
  blocks: { type: Array, default: () => [] },
});
defineEmits(["preview"]);
</script>

<style scoped>
.route-story { display: flex; flex-direction: column; gap: 12px; }
.story-text { margin: 0; white-space: pre-wrap; line-height: 1.7; }
.story-fig { margin: 0; }
.story-fig img {
  width: 100%;
  max-height: 280px;
  object-fit: cover;
  border-radius: 12px;
  display: block;
  cursor: zoom-in;
}
.story-fig figcaption {
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted);
}
</style>
