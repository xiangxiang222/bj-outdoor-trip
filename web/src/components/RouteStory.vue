<template>
  <div v-if="groups.length" class="route-story">
    <template v-for="(group, i) in groups" :key="i">
      <p v-if="group.type === 'text'" class="story-text">{{ group.body }}</p>
      <div v-else-if="group.items.length > 1" class="story-film">
        <figure v-for="(block, j) in group.items" :key="block.url + j" class="story-fig">
          <img :src="block.url" :alt="block.caption || ''" @click="$emit('preview', block.url)" />
          <figcaption v-if="block.caption">{{ block.caption }}</figcaption>
        </figure>
      </div>
      <figure v-else class="story-fig">
        <img :src="group.items[0].url" :alt="group.items[0].caption || ''" @click="$emit('preview', group.items[0].url)" />
        <figcaption v-if="group.items[0].caption">{{ group.items[0].caption }}</figcaption>
      </figure>
    </template>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { groupStoryBlocks } from "@/utils/story";

const props = defineProps({
  blocks: { type: Array, default: () => [] },
});
defineEmits(["preview"]);

const groups = computed(() => groupStoryBlocks(props.blocks));
</script>

<style scoped>
.route-story { display: flex; flex-direction: column; gap: 12px; }
.story-text { margin: 0; white-space: pre-wrap; line-height: 1.7; }
.story-fig { margin: 0; }
.story-fig img {
  width: 100%;
  height: 200px;
  object-fit: cover;
  border-radius: 12px;
  display: block;
  cursor: zoom-in;
}
.story-fig figcaption {
  margin-top: 6px;
  font-size: calc(12px * var(--ui-scale));
  color: var(--muted);
}
.story-film {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.story-film::-webkit-scrollbar { display: none; }
.story-film .story-fig {
  flex: 0 0 78%;
  scroll-snap-align: start;
}
.story-film .story-fig img { height: 168px; }
</style>
