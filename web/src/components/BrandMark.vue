<template>
  <svg
    class="brand-mark-svg"
    :class="size"
    viewBox="0 0 80 80"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    :aria-label="label"
  >
    <title>{{ label }}</title>
    <defs>
      <linearGradient :id="id + '-sky'" x1="0" y1="0" x2="80" y2="72" gradientUnits="userSpaceOnUse">
        <stop stop-color="#F3E8F8" />
        <stop offset=".5" stop-color="#F7F1E6" />
        <stop offset="1" stop-color="#F8E4E6" />
      </linearGradient>
      <linearGradient :id="id + '-hill'" x1="40" y1="46" x2="40" y2="80" gradientUnits="userSpaceOnUse">
        <stop stop-color="#7A9A42" />
        <stop offset="1" stop-color="#2F5A38" />
      </linearGradient>
    </defs>

    <rect width="80" height="80" :fill="'url(#' + id + '-sky)'" />

    <path d="M0 46L14 34l10 8 12-14 8 8 36-16v28H0z" fill="#B7A8C0" opacity=".35" />

    <g fill="#821A2A">
      <rect x="58.25" y="7" width="1.6" height="10" rx=".8" />
      <circle cx="59.05" cy="7.2" r="1.7" fill="#C9A24A" />
      <polygon points="52.5,20 59,14 65.5,20 63,22.2 55,22.2" />
      <rect x="55.2" y="21.4" width="7.7" height="3.2" fill="#6A1520" />
      <polygon points="49.2,29.5 59,22.2 68.8,29.5 65.2,31.8 52.8,31.8" />
      <rect x="53" y="31" width="12" height="3.6" fill="#6A1520" />
      <polygon points="46.2,40.2 59,31.8 71.8,40.2 67.2,42.6 50.8,42.6" />
      <rect x="51" y="41.8" width="16" height="4" fill="#6A1520" />
      <polygon points="43.5,51.5 59,42.6 74.5,51.5 68.5,54 49.5,54" />
    </g>

    <ellipse cx="63" cy="57.5" rx="15" ry="5.2" fill="#3E7484" opacity=".42" />

    <path :d="'M-6 61C16 49 30 54 40 51.5 56 48 70 43 86 47V82H-6z'" :fill="'url(#' + id + '-hill)'" />
    <path d="M8 76c14-12 24-16 33-20 10-4 17-8 32-9" fill="none" stroke="#F4EBD8" stroke-width="2.7" stroke-linecap="round" />

    <g fill="#6B2178">
      <polygon points="21.5,13 3.5,33.5 39.5,33.5" />
      <polygon points="21.5,17.5 9,32 34,32" fill="#7E2E90" />
      <rect x="9" y="32.2" width="25" height="4.4" rx=".4" fill="#541463" />
      <rect x="15.5" y="32.8" width="12" height="3.2" rx=".35" fill="#C9A24A" />
      <rect x="8.5" y="36.4" width="26" height="22" />
      <path :d="arch(12.2, 44, 3.1, 14.4)" fill="#2A1033" />
      <path :d="arch(21.5, 41.2, 4.2, 17.2)" fill="#2A1033" />
      <path :d="arch(32.4, 44, 3.1, 14.4)" fill="#2A1033" />
    </g>

    <g>
      <ellipse cx="29.2" cy="59.6" rx="2.1" ry="3.3" fill="#6B2178" />
      <circle cx="29.2" cy="55.4" r="1.35" fill="#6B2178" />
      <ellipse cx="38.6" cy="58.2" rx="2.1" ry="3.3" fill="#821A2A" />
      <circle cx="38.6" cy="54" r="1.35" fill="#821A2A" />
    </g>
  </svg>
</template>

<script setup>
import { useId } from "vue";

defineProps({
  size: { type: String, default: "sm" },
  label: { type: String, default: "同行者众" },
});

const id = "qb" + useId().replace(/[^a-zA-Z0-9]/g, "");

function arch(cx, top, r, h) {
  return `M${cx - r} ${top + h}V${top}a${r} ${r} 0 0 1 ${r * 2} 0v${h}z`;
}
</script>
