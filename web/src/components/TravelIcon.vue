<template>
  <svg class="travel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'mountain'"><path d="m2 20 7-13 4 7 3-5 6 11H2Z"/><path d="m6.8 11 2.2 2 2.2-2M14.5 11.5l1.5 1.5 1.5-1.5"/></template>
    <template v-else-if="name === 'search'"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></template>
    <template v-else-if="name === 'pin'"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></template>
    <template v-else-if="name === 'calendar'"><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 3h2"/></template>
    <template v-else-if="name === 'school'"><path d="m2 8 10-5 10 5-10 5L2 8Z"/><path d="M6 10v7c3 3 9 3 12 0v-7m4-2v8"/></template>
    <template v-else-if="name === 'building'"><rect x="4" y="3" width="11" height="18" rx="1.5"/><path d="M15 10h5v11H4M8 7h3m-3 4h3m-3 4h3m-2 6v-3m8-4h1m-1 3h1"/></template>
    <template v-else-if="name === 'people'"><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 4v3"/></template>
    <template v-else-if="name === 'campus-pals'"><circle cx="7.5" cy="6" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2 21v-3a5.5 5.5 0 0 1 11 0v3m3-7a5 5 0 0 1 6 5v2M19.5 2h3m-1.5-1.5v3"/></template>
    <template v-else-if="name === 'compass'"><circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/></template>
    <template v-else-if="name === 'arrow'"><path d="M4 12h15m-6-6 6 6-6 6"/></template>
    <template v-else-if="name === 'chevron'"><path d="m9 5 7 7-7 7"/></template>
    <template v-else-if="name === 'headset'"><path d="M4 13V11a8 8 0 0 1 16 0v6a4 4 0 0 1-4 4h-3"/><rect x="2" y="11" width="5" height="7" rx="2"/><rect x="17" y="11" width="5" height="7" rx="2"/></template>
    <template v-else-if="name === 'shield'"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></template>
    <template v-else-if="name === 'star'"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></template>
    <template v-else-if="name === 'heart'"><path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 3 11 8 15 5-4 13-10 8-15Z"/></template>
    <template v-else-if="name === 'ticket'"><path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Z"/><path d="M15 6v2m0 3v2m0 3v2"/></template>
    <template v-else-if="name === 'sun'"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></template>
    <template v-else-if="name === 'check'"><path d="m5 12 4 4L19 6"/></template>
    <template v-else-if="name === 'cards'"><rect x="7" y="4" width="13" height="17" rx="2"/><path d="m4 17-2-12a2 2 0 0 1 1.6-2.3L14 1m-.5 7-3 4 3 4 3-4-3-4Z"/></template>
    <template v-else-if="name === 'run'"><circle cx="16" cy="4" r="2"/><path d="m10 8 4-1 3 5h4M7 6l3 2-3 5 5 3-2 6M7 13l-3 5H1m11-10 2 5 4 3v5"/></template>
    <template v-else-if="name === 'film'"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18m10-18v18M3 8h4m-4 8h4m10-8h4m-4 8h4M7 12h10"/></template>
    <template v-else-if="name === 'community'"><circle cx="8" cy="8" r="3"/><circle cx="18" cy="7" r="2"/><path d="M2 21v-3a6 6 0 0 1 12 0v3m3-9a5 5 0 0 1 5 5v3M18 1v2m4 1-1 1"/></template>
    <template v-else-if="name === 'clock'"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></template>
    <template v-else-if="name === 'plus'"><path d="M12 4v16M4 12h16"/></template>
    <template v-else-if="name === 'filter'"><path d="M3 6h18M6 12h12m-9 6h6"/></template>
    <template v-else><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></template>
  </svg>
</template>
<script setup>
defineProps({ name: { type: String, default: 'mountain' } });
</script>
