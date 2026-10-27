<template>
  <svg class="ops-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="paths[name] || paths.mountain"></svg>
</template>

<script setup>
defineProps({ name: { type: String, default: "mountain" } });
const paths = {
  mountain: '<path d="m2 19 7-13 5 8 3-5 5 10H2Z"/><path d="m6 12 3 2 3-3"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  route: '<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h8a4 4 0 0 1 0 8H7a4 4 0 0 0 0 8h2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h3m4 0h3m-10 3h3"/>',
  people: '<path d="M3 21v-2a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v2m1-7a5 5 0 0 1 4 5v2"/><circle cx="9.5" cy="6.5" r="3.5"/><path d="M16 3a3.5 3.5 0 0 1 0 7"/>',
  wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9V5a2 2 0 0 1 2-2h13m3 8h-5a2 2 0 0 0 0 4h5"/>',
  gift: '<path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13"/><path d="M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/>',
  ticket: '<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Z"/><path d="M15 5v2m0 4v2m0 4v2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  chat: '<path d="M21 11a8 8 0 0 1-8 8H7l-4 3V7a4 4 0 0 1 4-4h6a8 8 0 0 1 8 8Z"/><path d="M7 9h9M7 13h6"/>',
  tag: '<path d="M3 4h8l10 10-8 8L3 12V4Z"/><circle cx="7.5" cy="8" r="1"/>',
  refund: '<path d="M4 10a8 8 0 1 1 0 5m0-5V4m0 6h6m0 0 2 3 2-3m-2 3v5m-3-2h6"/>',
  settings: '<path d="m9 3-1 3-3 1-1 4 2 2v4l3 2 3-1 3 1 3-2v-4l2-2-1-4-3-1-1-3H9Z"/><circle cx="12" cy="11" r="3"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  logout: '<path d="M9 3H4v18h5m5-14 5 5-5 5m-6-5h11"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  bus: '<rect x="4" y="3" width="16" height="16" rx="3"/><path d="M4 11h16M9 3v8M7 15h1m8 0h1M7 19v2m10-2v2"/>',
  refresh: '<path d="M20 8a9 9 0 0 0-15-3L2 8m0-5v5h5m-3 8a9 9 0 0 0 15 3l3-3m0 5v-5h-5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
};
</script>

<style scoped>
.ops-icon { width: 21px; height: 21px; flex: 0 0 auto; vertical-align: middle; }
</style>
