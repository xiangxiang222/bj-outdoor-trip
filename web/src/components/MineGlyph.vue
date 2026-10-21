<template>
  <svg class="mine-glyph" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="mineGlyphs[name]"></svg>
</template>

<script setup>
import { mineGlyphs } from "./mine-glyphs.js";

defineProps({
  name: { type: String, required: true },
});
</script>
