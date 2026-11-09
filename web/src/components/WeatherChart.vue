<template>
  <div v-if="layout" class="wx-chart">
    <svg :viewBox="`0 0 ${layout.width} ${layout.height}`" role="img" :aria-label="label">
      <defs>
        <linearGradient :id="fillId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" class="wx-fill" stop-opacity="0.13" />
          <stop offset="100%" class="wx-fill" stop-opacity="0.015" />
        </linearGradient>
      </defs>
      <line class="wx-grid" :x1="layout.pad.l" :x2="layout.width - layout.pad.r" :y1="layout.baseY" :y2="layout.baseY" />
      <g v-if="layout.maxPrecip > 0" class="wx-rain">
        <rect
          v-for="p in rainPoints"
          :key="'p' + p.hour"
          :x="p.x - 2.5"
          :y="layout.baseY - barH(p)"
          width="5"
          :height="barH(p)"
          rx="2"
        />
      </g>
      <path :d="layout.area" :fill="`url(#${fillId})`" />
      <path class="wx-line" :d="layout.line" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
      <g v-for="p in labelledPoints" :key="p.hour">
        <circle class="wx-point" :cx="p.x" :cy="p.y" r="2.5" stroke-width="1.4" />
        <text class="wx-t" :x="p.x" :y="p.y - 8" text-anchor="middle">{{ p.temp }}°</text>
        <text v-if="p.hourLabel" class="wx-h" :x="p.x" :y="layout.height - 6" text-anchor="middle">{{ p.hourLabel }}</text>
      </g>
    </svg>
  </div>
</template>

<script setup>
import { computed, useId } from "vue";
import { layoutWeatherChart } from "@/utils/weatherChart";

const props = defineProps({
  hourly: { type: Array, default: () => [] },
  label: { type: String, default: "分时气温" },
});

const fillId = `wxFill${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
const layout = computed(() => layoutWeatherChart(props.hourly, 360, 140));
const rainPoints = computed(() => layout.value?.points.filter((point) => point.precip > 0) || []);
const labelledPoints = computed(() => layout.value?.points.filter((point) => point.hourLabel) || []);

function barH(p) {
  if (!layout.value.maxPrecip) return 0;
  return Math.max(2, (p.precip / layout.value.maxPrecip) * 18);
}
</script>

<style scoped>
.wx-chart { --weather-line:var(--detail-accent,#80629d); width:100%; margin-top:4px; }
.wx-chart svg { width:100%; height:auto; display:block; overflow:visible; }
.wx-fill { stop-color:var(--weather-line); }
.wx-line { stroke:var(--weather-line); }
.wx-point { fill:var(--card,var(--paper,#fff)); stroke:var(--weather-line); }
.wx-grid { stroke:var(--line,#eeecf2); stroke-width:1; }
.wx-rain { fill:#baaacb; opacity:.65; }
.wx-t { font-size:calc(11px * var(--ui-scale,1)); fill:var(--weather-line); font-weight:500; }
.wx-h { font-size:calc(10px * var(--ui-scale,1)); fill:var(--muted,#8a8692); }
:global(html[data-night="dark"] .wx-chart) { --weather-line:var(--detail-accent,#c2a5e0); }
</style>
