<template>
  <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" class="wish-glyph">
    <template v-if="kind === 'drink'"><path d="M12 17h24l-3 25H15l-3-25Zm-2 0h28M23 17l4-12h7M17 27h16M20 33h8" /><path d="M18 11c-2-2-2-4 0-6m4 5c-1-2 0-3 1-4" /></template>
    <template v-else-if="kind === 'meal'"><path d="M5 25h38M9 25a15 15 0 0 1 30 0M24 10V6m-3 0h6M9 31l3 7h24l3-7M18 19c1-2 3-3 6-3" /></template>
    <template v-else-if="kind === 'outing'"><path d="m5 37 13-24 9 15 5-8 11 17H5Zm8-14 5 4 5-4M24 37v6m-7 0h14" /><circle cx="34" cy="10" r="4" /></template>
    <template v-else-if="kind === 'show'"><path d="M6 13h36v9a5 5 0 0 0 0 10v9H6v-9a5 5 0 0 0 0-10v-9Zm26 0v4m0 5v4m0 5v4m0 4v2M18 19l2.5 5 5.5.8-4 4 .9 5.7-4.9-2.7-5 2.7 1-5.7-4-4 5.5-.8 2.5-5Z" /></template>
    <template v-else-if="kind === 'transport'"><rect x="10" y="5" width="28" height="31" rx="7" /><path d="M10 21h28M24 5v16M15 36l-4 7m22-7 4 7M14 40h20M16 28h2m12 0h2" /></template>
    <template v-else-if="kind === 'trip'"><path d="m5 12 12-5 14 5 12-5v29l-12 5-14-5-12 5V12Zm12-5v29m14-24v29M21 24l3-4 3 4m-3-4v10" /></template>
    <template v-else-if="kind === 'heart'"><path d="M24 40S5 28 5 17C5 6 18 4 24 14 30 4 43 6 43 17c0 11-19 23-19 23Z" /></template>
    <template v-else-if="kind === 'arrow'"><path d="M8 24h32M29 13l11 11-11 11" /></template>
    <template v-else-if="kind === 'check'"><path d="m11 25 9 9 19-21" /></template>
    <template v-else><rect x="7" y="18" width="34" height="24" rx="3" /><path d="M5 18h38v-7H5v7Zm19-7v31M24 11c-3-10-15-10-15-4 0 5 15 4 15 4Zm0 0c3-10 15-10 15-4 0 5-15 4-15 4Z" /></template>
  </svg>
</template>

<script setup>
defineProps({ kind: { type: String, default: 'other' } });
</script>

<style scoped>
.wish-glyph{display:block;width:100%;height:100%;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
</style>
