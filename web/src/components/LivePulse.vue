<template>
  <div
    v-if="visible"
    class="live-pulse"
    :class="{ 'is-flush': flush }"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
  >
    <button class="live-pulse-main" type="button" :disabled="!canOpen" @click="go">
      <span class="live-pulse-face" aria-hidden="true">{{ face }}</span>
      <span class="live-pulse-track">
        <span :key="lineKey" class="live-pulse-text" :class="{ in: moving }">{{ line }}</span>
      </span>
    </button>
    <span v-if="watchingText && items.length" class="live-pulse-now">{{ watchingText }}</span>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import { pulseFace, pulsePath, visitorId } from "@/utils/pulse";

const props = defineProps({
  scope: { type: String, default: "home" },
  routeId: { type: [Number, String], default: 0 },
  scheduleId: { type: [Number, String], default: 0 },
  flush: { type: Boolean, default: false },
});

const router = useRouter();
const items = ref([]);
const watchingText = ref("");
const index = ref(0);
const paused = ref(false);
const moving = ref(false);
let rotateTimer = 0;
let refreshTimer = 0;
let viewed = false;

const current = computed(() => items.value[index.value] || null);
const line = computed(() => current.value?.text || watchingText.value);
const lineKey = computed(() => current.value?.id || watchingText.value || "pulse");
const face = computed(() => pulseFace(current.value?.who));
const visible = computed(() => items.value.length > 0 || !!watchingText.value);
const canOpen = computed(() => !!pulsePath(current.value));

async function load() {
  try {
    const res = await http.get("/live/pulse", {
      params: {
        scope: props.scope,
        routeId: Number(props.routeId) || undefined,
        scheduleId: Number(props.scheduleId) || undefined,
        visitorId: visitorId(),
      },
    });
    const data = res.data || {};
    items.value = Array.isArray(data.items) ? data.items : [];
    watchingText.value = data.watchingText || "";
    if (index.value >= items.value.length) index.value = 0;
  } catch {
    items.value = [];
    watchingText.value = "";
  }
}

async function ping() {
  if (viewed) return;
  viewed = true;
  try {
    await http.post("/live/view", {
      scope: props.scope,
      routeId: Number(props.routeId) || undefined,
      scheduleId: Number(props.scheduleId) || undefined,
      visitorId: visitorId(),
    });
  } catch {
    viewed = false;
  }
}

function go() {
  const path = pulsePath(current.value);
  if (path) router.push(path);
}

function tick() {
  if (paused.value || items.value.length < 2) return;
  moving.value = true;
  index.value = (index.value + 1) % items.value.length;
}

onMounted(() => {
  load();
  ping();
  rotateTimer = window.setInterval(tick, 4000);
  refreshTimer = window.setInterval(load, 60000);
});
onUnmounted(() => {
  window.clearInterval(rotateTimer);
  window.clearInterval(refreshTimer);
});
watch(
  () => [props.scope, props.routeId, props.scheduleId],
  () => {
    viewed = false;
    index.value = 0;
    load();
    ping();
  }
);
</script>
