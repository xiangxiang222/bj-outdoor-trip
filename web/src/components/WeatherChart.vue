<template>
  <div v-if="layout" class="wx-chart">
    <svg :viewBox="`0 0 ${layout.width} ${layout.height}`" role="img" :aria-label="label">
      <defs>
        <linearGradient :id="fillId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3a7ca5" stop-opacity="0.28" />
          <stop offset="100%" stop-color="#3a7ca5" stop-opacity="0" />
        </linearGradient>
      </defs>
      <g v-if="layout.maxPrecip > 0">
        <rect
          v-for="p in layout.points"
          :key="'p' + p.hour"
          :x="p.x - 4"
          :y="layout.baseY - barH(p)"
          width="8"
          :height="barH(p)"
          rx="2"
          fill="#8ecae6"
          opacity="0.55"
        />
      </g>
      <path :d="layout.area" :fill="`url(#${fillId})`" />
      <path :d="layout.line" fill="none" stroke="#3a7ca5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      <g v-for="p in layout.points" :key="p.hour">
        <circle :cx="p.x" :cy="p.y" r="2.8" fill="#fff" stroke="#3a7ca5" stroke-width="1.4" />
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
const layout = computed(() => layoutWeatherChart(props.hourly, 360, 148));

function barH(p) {
  if (!layout.value.maxPrecip) return 0;
  return Math.max(2, (p.precip / layout.value.maxPrecip) * 28);
}
</script>

<style scoped>
.wx-chart { width: 100%; height: 148px; margin-top: 4px; }
.wx-chart svg { width: 100%; height: 100%; display: block; overflow: visible; }
.wx-t { font-size: 10px; fill: #1b4332; font-weight: 650; }
.wx-h { font-size: 10px; fill: #6b705c; }
</style>
