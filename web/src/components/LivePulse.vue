<template>
  <div
    v-if="visible"
    class="live-pulse"
    :class="{ 'is-flush': flush, 'is-rows': rows.length > 1 }"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
  >
    <template v-if="rows.length">
      <button
        v-for="row in rows"
        :key="row.lane"
        class="live-pulse-main"
        type="button"
        :disabled="!pulsePath(row.item)"
        @click="goItem(row.item)"
      >
        <span class="live-pulse-face" aria-hidden="true">{{ row.face }}</span>
        <span class="live-pulse-track">
          <span :key="row.item.id" class="live-pulse-text" :class="{ in: moving }">{{ row.item.text }}</span>
        </span>
        <span v-if="row.lane === 0 && watchingText" class="live-pulse-now">{{ watchingText }}</span>
      </button>
    </template>
    <template v-else>
      <button class="live-pulse-main" type="button" :disabled="!canOpen" @click="go">
        <span class="live-pulse-face" aria-hidden="true">{{ face }}</span>
        <span class="live-pulse-track">
          <span :key="lineKey" class="live-pulse-text" :class="{ in: moving }">{{ line }}</span>
        </span>
      </button>
      <span v-if="watchingText && items.length" class="live-pulse-now">{{ watchingText }}</span>
    </template>
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

const laneCursor = ref([0, 0, 0]);
const turn = ref(0);
const current = computed(() => items.value[index.value] || null);
const line = computed(() => current.value?.text || watchingText.value);
const lineKey = computed(() => current.value?.id || watchingText.value || "pulse");
const face = computed(() => pulseFace(current.value?.who));
const visible = computed(() => items.value.length > 0 || !!watchingText.value);
const canOpen = computed(() => !!pulsePath(current.value));
const rows = computed(() => {
  if (props.scope !== "home") return [];
  const list = items.value;
  const lanes = Math.min(3, list.length);
  if (lanes < 2) return [];
  return Array.from({ length: lanes }, (_, lane) => {
    const bucket = [];
    for (let i = lane; i < list.length; i += lanes) bucket.push(list[i]);
    const item = bucket[laneCursor.value[lane] % bucket.length];
    return { lane, item, face: pulseFace(item.who) };
  });
});

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
  goItem(current.value);
}
function goItem(item) {
  const path = pulsePath(item);
  if (path) router.push(path);
}

function tick() {
  if (paused.value || items.value.length < 2) return;
  moving.value = true;
  if (props.scope === "home") {
    const lanes = Math.min(3, items.value.length);
    const lane = turn.value % lanes;
    turn.value += 1;
    let count = 0;
    for (let i = lane; i < items.value.length; i += lanes) count += 1;
    if (count < 2) return;
    const next = laneCursor.value.slice();
    next[lane] = (next[lane] + 1) % count;
    laneCursor.value = next;
    return;
  }
  index.value = (index.value + 1) % items.value.length;
}

onMounted(() => {
  load();
  ping();
  rotateTimer = window.setInterval(tick, props.scope === "home" ? 2800 : 4000);
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
