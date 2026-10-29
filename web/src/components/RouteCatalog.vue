<template>
  <section class="route-catalog" :class="'mode-' + mode" :data-mode="mode" data-testid="route-catalog" aria-label="精选线路">
    <div class="rc-intro"><span>CURATED JOURNEYS</span><h2>换个角度，发现山野</h2><p>先选心动的风景，再安排下一次出发。</p></div>
    <div class="rc-filters">
      <div class="rc-scroll" role="group" aria-label="线路天数">
        <button type="button" :aria-pressed="days === 0" :class="{ on: days === 0 }" @click="days = 0">全部天数</button>
        <button v-for="n in [1, 2, 3]" :key="n" type="button" :aria-pressed="days === n" :class="{ on: days === n }" @click="days = n">{{ n }}日</button>
        <button type="button" :aria-pressed="days === 'multi'" :class="{ on: days === 'multi' }" @click="days = 'multi'">多日</button>
      </div>
      <div class="rc-scroll rc-play" role="group" aria-label="线路玩法">
        <button type="button" :aria-pressed="tag === ''" :class="{ on: tag === '' }" @click="tag = ''">全部玩法</button>
        <button v-for="item in tags" :key="item.id || item.name" type="button" :aria-pressed="tag === item.name" :class="{ on: tag === item.name }" @click="tag = item.name">{{ item.name }}</button>
      </div>
    </div>
    <div class="rc-toolbar">
      <p><strong>{{ list.length }}</strong> 条山野灵感<span v-if="loading && list.length"> · 更新中</span></p>
      <div class="rc-modes" role="group" aria-label="线路显示方式">
        <button v-for="item in modes" :key="item.key" type="button" :class="{ on: mode === item.key }" :data-testid="'route-mode-' + item.key" :aria-label="item.label + '模式'" :aria-pressed="mode === item.key" @click="setMode(item.key)">
          <svg v-if="item.key === 'poster'" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="m4 13 4-4 4 4 2-2 3 3M6 15h5"/><circle cx="13.5" cy="6.5" r="1"/></svg>
          <svg v-else-if="item.key === 'grid'" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="3" width="5.5" height="6" rx="1"/><rect x="11.5" y="3" width="5.5" height="6" rx="1"/><rect x="3" y="12" width="5.5" height="5" rx="1"/><rect x="11.5" y="12" width="5.5" height="5" rx="1"/></svg>
          <svg v-else viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="3.5" width="5" height="5" rx="1"/><rect x="3" y="11.5" width="5" height="5" rx="1"/><path d="M11 4.5h6M11 7.5h4M11 12.5h6M11 15.5h4"/></svg>
          <span>{{ item.label }}</span>
        </button>
      </div>
    </div>
    <div v-if="error" class="rc-error" role="alert"><div><strong>线路暂时加载失败</strong><p>{{ list.length ? '已保留上次结果，重新加载即可更新。' : '请检查网络，再试一次。' }}</p></div><button type="button" :disabled="loading" @click="load">重新加载</button></div>
    <LoadRow v-if="loading && !list.length" />
    <div v-if="list.length" class="rc-results" :class="'mode-' + mode" :aria-busy="loading">
      <router-link v-for="route in cards" :key="route.id" class="rc-card" data-testid="route-card" :to="'/m/route/' + route.id">
        <div class="rc-photo">
          <span class="rc-fallback" aria-hidden="true"><svg viewBox="0 0 70 55" fill="none"><path d="m5 46 23-33 19 27 9-14 10 20M19 26l9 4 6-9M5 51h61"/><circle cx="53" cy="12" r="5"/></svg></span>
          <img v-if="route.cover && !brokenImages[route.id]" :src="route.cover" :alt="route.title || '线路风景'" loading="lazy" decoding="async" @error="brokenImages[route.id] = true" />
          <span v-if="route.region" class="rc-region"><svg viewBox="0 0 12 14" fill="none" aria-hidden="true"><path d="M10.5 5.5C10.5 9 6 13 6 13S1.5 9 1.5 5.5a4.5 4.5 0 1 1 9 0Z"/><circle cx="6" cy="5.5" r="1.4"/></svg>{{ route.region }}</span>
        </div>
        <div class="rc-copy">
          <p class="rc-meta"><span v-if="route.region" class="rc-text-region">{{ route.region }} · </span>{{ route.days || 1 }}日<span v-if="route.difficulty"> · {{ route.difficulty }}</span><span v-if="route.distanceKm"> · {{ route.distanceKm }}km</span></p>
          <h3>{{ route.title }}</h3>
          <p v-if="route.subtitle" class="rc-description">{{ route.subtitle }}</p>
          <div v-if="route.labels.length" class="rc-labels"><span v-for="label in route.labels" :key="label">{{ label }}</span></div>
          <div class="rc-bottom">
            <div class="rc-price"><span v-if="route.price.amount != null" class="rc-price-main"><small>¥</small>{{ route.price.amount }}<em>起</em></span><span v-else class="rc-price-pending">价格待确认</span><s v-if="route.price.original != null">¥{{ route.price.original }}</s><span v-if="route.price.member" class="rc-member">会员价</span></div>
            <p class="rc-departure" :class="{ scheduled: route.departure.count }"><span v-if="route.departure.count"><i></i>{{ route.departure.date.slice(5).replace('-', '.') }} 出发</span><span v-else>暂无排期 · 可发团</span><svg viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 6h6M6 3l3 3-3 3"/></svg></p>
          </div>
        </div>
      </router-link>
    </div>
    <div v-else-if="ready && !loading && !error" class="rc-empty"><svg viewBox="0 0 56 48" fill="none" aria-hidden="true"><path d="m3 39 18-29 16 23 8-12 9 18M14 22l7 4 6-8M3 44h51"/><circle cx="43" cy="8" r="4"/></svg><h3>{{ q || days || tag ? '没有匹配的线路' : '下一段山野，正在准备中' }}</h3><p>{{ q || days || tag ? '换个天数或玩法，看看新的风景。' : '正式线路发布后，会出现在这里。' }}</p><button v-if="days || tag" type="button" @click="clearFilters">重置天数与玩法</button></div>
    <router-link class="rc-apply" to="/m/route-apply"><span><strong>把你喜欢的路线，分享给同行的人</strong><small>没有想走的线？申请收录</small></span><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5"/></svg></router-link>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import http from "@/api/http";
import LoadRow from "@/components/LoadRow.vue";
import { ROUTE_MODES, normalizeRouteMode, routeLabels, routePriceFacts, routeUpcomingFacts } from "@/utils/routePresentation";

const props = defineProps({ q: { type: String, default: "" }, seedTag: { type: String, default: "" } });
const list = ref([]);
const days = ref(0);
const tag = ref(props.seedTag || "");
const tags = ref([]);
const ready = ref(false);
const loading = ref(false);
const error = ref(false);
const brokenImages = ref({});
const modes = ROUTE_MODES;
const mode = ref("poster");
const cards = computed(() => list.value.map((route) => ({ ...route, labels: routeLabels(route), price: routePriceFacts(route), departure: routeUpcomingFacts(route) })));
let requestId = 0;
let disposed = false;

function setMode(value) {
  mode.value = normalizeRouteMode(value);
  try { localStorage.setItem("bj_route_view", mode.value); } catch { /* Browsing remains usable when storage is blocked. */ }
}
async function load() {
  const current = ++requestId;
  const params = {};
  if (days.value) params.days = days.value;
  if (tag.value) params.tag = tag.value;
  if (props.q) params.q = props.q;
  loading.value = true;
  error.value = false;
  try {
    const response = await http.get("/routes", { params });
    if (disposed || current !== requestId) return;
    if (!Array.isArray(response.data)) throw new Error("Invalid route list");
    list.value = response.data;
    brokenImages.value = {};
    ready.value = true;
  } catch {
    if (!disposed && current === requestId) error.value = true;
  } finally {
    if (!disposed && current === requestId) loading.value = false;
  }
}
function clearFilters() { days.value = 0; tag.value = ""; }
watch([days, tag, () => props.q], load);
watch(() => props.seedTag, (value) => { tag.value = value || ""; });
onMounted(() => {
  try { mode.value = normalizeRouteMode(localStorage.getItem("bj_route_view")); } catch { /* Default to the editorial view. */ }
  load();
  http.get("/play-tags").then((response) => { if (!disposed) tags.value = Array.isArray(response.data) ? response.data : []; }).catch(() => {});
});
onUnmounted(() => { disposed = true; requestId++; });
</script>

<style scoped>
.route-catalog { --rc-ink:#2c2634; --rc-purple:#5b3b8c; --rc-muted:#81758c; --rc-paper:#fff; --rc-line:#e9e2ef; --rc-soft:#f2edf8; --rc-image:#e8e0f0; color:var(--rc-ink); padding:6px 0 3px; overflow-wrap:anywhere; }
.route-catalog *, .route-catalog *::before, .route-catalog *::after { box-sizing:border-box; }
.route-catalog button { font:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.route-catalog svg { flex:none; display:block; stroke:currentColor; stroke-width:1.3; stroke-linecap:round; stroke-linejoin:round; }
.route-catalog h2, .route-catalog h3, .route-catalog p { margin:0; }
.route-catalog a { color:inherit; text-decoration:none; }
.route-catalog button:focus-visible, .route-catalog a:focus-visible { outline:2px solid #a78bc4; outline-offset:3px; }
.rc-intro { padding:12px 0 19px; }
.rc-intro > span { color:#a08bb5; font-size:9px; letter-spacing:.16em !important; }
.rc-intro h2 { margin-top:7px; font-size:calc(21px * var(--ui-scale,1)); font-weight:600; line-height:1.5; }
.rc-intro p { margin-top:6px; color:var(--rc-muted); font-size:calc(12px * var(--ui-scale,1)); line-height:1.7; }
.rc-filters { border-bottom:1px solid var(--rc-line); padding-bottom:8px; }
.rc-scroll { display:flex; gap:8px; overflow:auto; scrollbar-width:none; padding:3px 1px 10px; }
.rc-scroll::-webkit-scrollbar { display:none; }
.rc-scroll button { flex:none; padding:8px 13px; border:1px solid var(--rc-line); border-radius:10px; background:var(--rc-paper); color:#82728f; font-size:calc(12px * var(--ui-scale,1)); line-height:1.4; white-space:nowrap; }
.rc-scroll button.on { color:var(--rc-purple); border-color:#d7c8e8; background:#eee7f7; font-weight:600; }
.rc-play button { padding:6px 11px; border:0; border-radius:7px; background:transparent; font-size:calc(11px * var(--ui-scale,1)); }
.rc-play button.on { background:var(--rc-soft); }
.rc-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:17px 0; }
.rc-toolbar > p { color:var(--rc-muted); font-size:calc(11px * var(--ui-scale,1)); line-height:1.6; }
.rc-toolbar > p strong { color:var(--rc-purple); font-size:calc(14px * var(--ui-scale,1)); font-weight:600; background:transparent; }
.rc-modes { display:flex; flex:none; gap:2px; padding:3px; border:1px solid var(--rc-line); border-radius:10px; background:var(--rc-paper); }
.rc-modes button { display:flex; align-items:center; gap:4px; padding:6px 8px; border:0; border-radius:7px; color:#94859f; background:transparent; font-size:calc(10px * var(--ui-scale,1)); line-height:1.2; }
.rc-modes button svg { width:15px; height:15px; }
.rc-modes button.on { color:var(--rc-purple); background:var(--rc-soft); }
.rc-results { display:grid; grid-template-columns:minmax(0,1fr); gap:17px; }
.rc-card { display:flex; flex-direction:column; min-width:0; overflow:hidden; border:1px solid var(--rc-line); border-radius:18px; background:var(--rc-paper); transition:border-color .18s,transform .18s; }
.rc-card:hover { border-color:#c9b2de; transform:translateY(-2px); }
.rc-photo { position:relative; flex:none; aspect-ratio:16/9; overflow:hidden; background:var(--rc-image); }
.rc-photo > img { position:absolute; width:100%; height:100%; object-fit:cover; }
.rc-fallback { position:absolute; inset:0; display:grid; place-items:center; color:#b7a2ca; }
.rc-fallback svg { width:70px; height:55px; }
.rc-region { position:absolute; left:12px; bottom:12px; display:flex; align-items:center; gap:4px; max-width:calc(100% - 24px); color:#fff; background:#2d233d66; border:1px solid #ffffff45; backdrop-filter:blur(5px); border-radius:6px; padding:4px 7px; font-size:calc(10px * var(--ui-scale,1)); line-height:1.4; }
.rc-region svg { width:10px; height:12px; }
.rc-copy { display:flex; flex-direction:column; flex:1; min-width:0; padding:16px; }
.rc-meta { color:var(--rc-muted); font-size:calc(11px * var(--ui-scale,1)); line-height:1.5; }
.rc-text-region { display:none; }
.rc-card h3 { margin-top:5px; color:var(--rc-ink); font-size:calc(18px * var(--ui-scale,1)); font-weight:600; line-height:1.6; }
.rc-description { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; color:var(--rc-muted); font-size:calc(12px * var(--ui-scale,1)); line-height:1.7; margin-top:5px !important; }
.rc-labels { display:flex; flex-wrap:wrap; gap:5px; margin-top:10px; }
.rc-labels span { color:#8f789f; background:var(--rc-soft); padding:3px 6px; border-radius:5px; font-size:calc(10px * var(--ui-scale,1)); line-height:1.4; }
.rc-bottom { margin-top:auto; padding-top:15px; }
.rc-price { display:flex; align-items:baseline; flex-wrap:wrap; gap:5px; }
.rc-price-main { color:var(--rc-purple); font-size:calc(24px * var(--ui-scale,1)); font-weight:600; line-height:1.2; }
.rc-price-main small { font-size:calc(12px * var(--ui-scale,1)); margin-right:2px; font-weight:400; }
.rc-price-main em { font-style:normal; font-size:calc(10px * var(--ui-scale,1)); font-weight:400; color:var(--rc-muted); margin-left:4px; }
.rc-price s { color:#aaa0b3; font-size:calc(11px * var(--ui-scale,1)); }
.rc-member { color:var(--rc-purple); background:var(--rc-soft); border:1px solid var(--rc-line); border-radius:4px; padding:1px 4px; font-size:calc(9px * var(--ui-scale,1)); }
.rc-price-pending { color:var(--rc-muted); font-size:calc(13px * var(--ui-scale,1)); }
.rc-departure { display:flex; align-items:center; justify-content:space-between; gap:7px; color:#9a8ba6; border-top:1px solid var(--rc-line); padding-top:10px; margin-top:13px !important; font-size:calc(11px * var(--ui-scale,1)); line-height:1.5; }
.rc-departure > span { display:flex; align-items:center; gap:5px; min-width:0; }
.rc-departure.scheduled { color:#78628c; }
.rc-departure i { width:4px; height:4px; border-radius:50%; background:currentColor; flex:none; }
.rc-departure svg { width:13px; height:13px; color:#aa94bc; }
.mode-grid.rc-results { grid-template-columns:repeat(2,minmax(0,1fr)); gap:11px; }
.mode-grid .rc-card { border-radius:14px; }
.mode-grid .rc-photo { aspect-ratio:4/3; }
.mode-grid .rc-copy { padding:11px; }
.mode-grid .rc-region { left:7px; bottom:7px; max-width:calc(100% - 14px); padding:3px 5px; font-size:calc(9px * var(--ui-scale,1)); }
.mode-grid .rc-meta { font-size:calc(10px * var(--ui-scale,1)); }
.mode-grid h3 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; font-size:calc(14px * var(--ui-scale,1)); line-height:1.55; }
.mode-grid .rc-description { font-size:calc(10px * var(--ui-scale,1)); }
.mode-grid .rc-labels { gap:4px; margin-top:7px; }
.mode-grid .rc-labels span { font-size:calc(9px * var(--ui-scale,1)); padding:2px 4px; }
.mode-grid .rc-bottom { padding-top:12px; }
.mode-grid .rc-price { gap:3px; }
.mode-grid .rc-price-main { font-size:calc(20px * var(--ui-scale,1)); }
.mode-grid .rc-price s { font-size:calc(9px * var(--ui-scale,1)); }
.mode-grid .rc-departure { font-size:calc(10px * var(--ui-scale,1)); margin-top:10px !important; padding-top:8px; }
.mode-list.rc-results { gap:12px; }
.mode-list .rc-card { flex-direction:row; padding:10px; gap:12px; border-radius:15px; }
.mode-list .rc-photo { flex-basis:104px; min-height:126px; aspect-ratio:auto; border-radius:10px; }
.mode-list .rc-region { bottom:7px; left:7px; padding:3px 5px; max-width:calc(100% - 14px); font-size:calc(9px * var(--ui-scale,1)); }
.mode-list .rc-copy { padding:2px 0 0; }
.mode-list h3 { font-size:calc(15px * var(--ui-scale,1)); line-height:1.55; }
.mode-list .rc-description { display:none; }
.mode-list .rc-labels { margin-top:7px; }
.mode-list .rc-bottom { padding-top:11px; }
.mode-list .rc-price-main { font-size:calc(21px * var(--ui-scale,1)); }
.mode-list .rc-departure { border-top:0; padding-top:0; margin-top:8px !important; font-size:calc(10px * var(--ui-scale,1)); }
.rc-error { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px; margin-bottom:16px; border:1px solid var(--rc-line); border-radius:14px; background:var(--rc-soft); }
.rc-error strong { font-size:calc(13px * var(--ui-scale,1)); font-weight:500; color:var(--rc-ink); background:transparent; }
.rc-error p { font-size:calc(11px * var(--ui-scale,1)); color:var(--rc-muted); line-height:1.7; margin-top:5px; }
.rc-error button { flex:none; border:1px solid #d7c7e8; border-radius:8px; color:var(--rc-purple); background:var(--rc-paper); padding:8px 10px; font-size:calc(11px * var(--ui-scale,1)); }
.rc-empty { padding:27px 20px; border:1px solid var(--rc-line); border-radius:17px; background:var(--rc-paper); text-align:center; }
.rc-empty > svg { width:56px; height:48px; margin:0 auto 15px; color:#b7a1cb; }
.rc-empty h3 { font-size:calc(16px * var(--ui-scale,1)); font-weight:500; }
.rc-empty p { color:var(--rc-muted); font-size:calc(12px * var(--ui-scale,1)); line-height:1.8; margin-top:8px; }
.rc-empty button { margin-top:16px; border:1px solid var(--rc-line); border-radius:999px; padding:8px 14px; color:var(--rc-purple); background:var(--rc-soft); font-size:calc(12px * var(--ui-scale,1)); }
.rc-apply { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:22px; padding:17px; border:1px dashed #d5c5e5; border-radius:15px; background:var(--rc-soft); color:var(--rc-purple) !important; }
.rc-apply > span { min-width:0; }
.rc-apply strong { display:block; color:inherit; font-size:calc(12px * var(--ui-scale,1)); line-height:1.6; font-weight:500; background:transparent; }
.rc-apply small { display:block; margin-top:4px; color:var(--rc-muted); font-size:calc(11px * var(--ui-scale,1)); line-height:1.6; }
.rc-apply > svg { width:20px; height:20px; }
:global(html[data-night="dark"] .route-catalog) { --rc-ink:#eee7f5; --rc-purple:#d2b6f1; --rc-muted:#b5a7c3; --rc-paper:#241d2e; --rc-line:#41334e; --rc-soft:#33253f; --rc-image:#3b2d47; }
:global(html[data-night="dark"] .route-catalog .rc-scroll button.on) { background:#3c2b4b; border-color:#655078; }
:global(html[data-night="dark"] .route-catalog .rc-meta), :global(html[data-night="dark"] .route-catalog .rc-scroll button), :global(html[data-night="dark"] .route-catalog .rc-modes button), :global(html[data-night="dark"] .route-catalog .rc-labels span), :global(html[data-night="dark"] .route-catalog .rc-departure) { color:#b7a4c9; }
:global(html[data-night="dark"] .route-catalog .rc-modes button.on), :global(html[data-night="dark"] .route-catalog .rc-scroll button.on) { color:#dfc6f5; }
:global(html[data-text="1"] .route-catalog .rc-photo) { display:none; }
:global(html[data-text="1"] .route-catalog .rc-text-region) { display:inline; }
:global(html[data-text="1"] .route-catalog .mode-list .rc-copy) { padding:5px; }
@media (max-width:360px) { .rc-toolbar { flex-wrap:wrap; gap:8px; } .rc-modes { margin-left:auto; } .mode-grid.rc-results { gap:9px; } .mode-grid .rc-copy { padding:9px; } .mode-grid .rc-member { font-size:calc(8px * var(--ui-scale,1)); } .mode-list .rc-photo { flex-basis:84px; } .mode-list .rc-card { gap:10px; } }
@media (min-width:700px) { .rc-intro h2 { font-size:calc(27px * var(--ui-scale,1)); } .rc-toolbar { margin:21px 0; } .rc-results.mode-poster { grid-template-columns:repeat(2,minmax(0,1fr)); gap:22px; } .rc-results.mode-grid { grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; } .rc-results.mode-list { grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; } .mode-grid h3 { font-size:calc(16px * var(--ui-scale,1)); } .mode-grid .rc-copy { padding:15px; } .mode-grid .rc-photo { aspect-ratio:16/11; } .rc-modes button { padding:7px 11px; font-size:calc(12px * var(--ui-scale,1)); } .rc-modes button svg { width:17px; height:17px; } }
@media (prefers-reduced-motion:reduce) { .rc-card { transition:none; } }
</style>
