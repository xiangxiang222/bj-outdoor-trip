<template>
  <div class="activity-page">
    <header class="activity-hero">
      <div class="activity-hero-top"><span>CITY MOMENTS</span><span class="activity-city"><i></i>北京 · 同城相遇</span></div>
      <div class="activity-hero-main">
        <div class="activity-hero-copy"><h1>把喜欢的事，<br />约在一起</h1><p>不必等远方，好时光就在身旁。</p></div>
        <div class="activity-hero-art" aria-hidden="true"><i class="art-orbit"></i><i class="art-spark"></i><div class="art-ticket back"><span>TOGETHER</span><i></i></div><div class="art-ticket front"><svg viewBox="0 0 40 40" fill="none"><path d="M12 25c-6-4-6-10-2-12 4-2 7 0 10 4 3-4 6-6 10-4s4 8-2 12l-8 6-8-6Z"/><path d="m13 9 1-4m12 4 2-4M8 29l-4 1m28-1 4 1"/></svg><span>MEET &amp; PLAY</span><i></i></div></div>
      </div>
      <div class="activity-hero-bottom"><span>从一个兴趣，认识一群同频的人</span><button type="button" @click="goPublish()"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>发起活动</button></div>
    </header>

    <router-link class="activity-wish-entry" to="/m/wishes"><span class="wish-entry-symbol" aria-hidden="true">✧</span><span><b>意思意思</b><small>一杯喜欢的，一件想做的，给心意一个回应。</small></span><span aria-hidden="true">↗</span></router-link>
    <nav class="activity-kinds" aria-label="选择活动类型">
      <button v-for="(item, index) in kinds" :key="item.key" type="button" class="activity-kind" :class="[{ on: kind === item.key }, 'kind-' + index]" :aria-pressed="kind === item.key" @click="selectKind(item.key)">
        <span class="activity-kind-icon"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><template v-if="index === 0"><rect x="9" y="5" width="17" height="23" rx="3" transform="rotate(12 9 5)"/><rect x="5" y="3" width="17" height="23" rx="3"/><path d="m13.5 10 4 5-4 5-4-5 4-5Z"/></template><template v-else-if="index === 1"><circle cx="21" cy="5" r="2.5"/><path d="m9 11 6-3 5 6 6 1M15 8l-3 11 7 3 2 7M12 19l-4 8H3m5-10H3m5-10H5"/></template><template v-else-if="index === 2"><rect x="4" y="10" width="24" height="18" rx="3"/><path d="M4 17h24M4 10l23-6 1.5 5M7 9l3 5m5-7 3 5m5-7 3 5m-13 9 7 4-7 4v-8Z"/></template><template v-else><circle cx="16" cy="9" r="4"/><path d="M8 28v-5a8 8 0 0 1 16 0v5M5 8a3 3 0 0 0 0 6m22-6a3 3 0 0 1 0 6M2 26v-4a6 6 0 0 1 5-6m23 10v-4a6 6 0 0 0-5-6"/></template></svg></span>
        <strong>{{ item.label }}</strong><small>{{ ['牌桌见朋友','跑出好心情','共赴光影','招募新朋友'][index] }}</small><i v-if="kind === item.key" class="kind-indicator"></i>
      </button>
    </nav>

    <section v-if="selectedKind" class="activity-theme" :aria-label="selectedKind.label + '活动介绍'">
      <div><span>THE SAME INTEREST</span><h2>{{ selectedKind.title }}</h2><p>{{ selectedKind.description }}</p><p v-if="selectedKind.notice" class="activity-theme-note">{{ selectedKind.notice }}</p></div><button type="button" @click="goPublish()">{{ selectedKind.publishLabel || '发起活动' }} <span aria-hidden="true">↗</span></button>
    </section>

    <section class="activity-discover" aria-label="发现同城活动">
      <div class="activity-section-head"><div><span>MEET YOUR PEOPLE</span><h2>{{ selectedKind ? '下一场，就等你来' : '让日常，多一点有趣' }}</h2></div><span class="activity-result-count" aria-live="polite">{{ loading && !loaded ? '正在加载' : loaded ? list.length + ' 场可参与' : '' }}</span></div>
      <div class="activity-search-row"><label class="activity-search"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input v-model="query" type="search" aria-label="搜索活动" :placeholder="selectedKind?.searchPlaceholder || '搜索活动、地点或发起人'" /></label><button class="activity-filter-toggle" type="button" :class="{ on: filterOpen || extraCount }" :aria-expanded="filterOpen" aria-controls="activity-more-filters" @click="filterOpen = !filterOpen"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.5"/><circle cx="15" cy="17" r="2.5"/></svg><span>筛选<small v-if="extraCount">{{ extraCount }}</small></span></button></div>
      <div class="activity-filter-line"><div class="activity-dates" role="group" aria-label="活动时间"><button v-for="item in periods" :key="item.key" type="button" :class="{ on: time === item.key }" :aria-pressed="time === item.key" @click="time = item.key">{{ item.label }}</button></div><label class="activity-sort"><span class="visually-hidden">活动排序</span><select v-model="sort" aria-label="活动排序"><option value="soon">即将开始</option><option value="filling">快满员</option><option value="new">最新发布</option></select><svg viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4 3 3 3-3"/></svg></label></div>
      <div v-if="filterOpen" id="activity-more-filters" class="activity-more-filters"><label><span>所在城区</span><select v-model="city" aria-label="所在城区"><option value="">不限城区</option><option v-for="name in cities" :key="name" :value="name">{{ name }}</option></select></label><div class="activity-filter-toggles"><button type="button" :class="{ on: freeOnly }" :aria-pressed="freeOnly" @click="freeOnly = !freeOnly"><i>{{ freeOnly ? '✓' : '' }}</i>只看免费</button><button type="button" :class="{ on: availableOnly }" :aria-pressed="availableOnly" @click="availableOnly = !availableOnly"><i>{{ availableOnly ? '✓' : '' }}</i>有余位</button></div><p>已满员的活动仍可查看候补详情。</p></div>
      <div v-if="hasFilters" class="activity-applied"><span>{{ selectedKind ? selectedKind.label + ' · ' : '' }}{{ city || '全部城区' }}<template v-if="query.trim()"> · {{ query.trim() }}</template></span><button type="button" @click="clearFilters">清空筛选 <span aria-hidden="true">×</span></button></div>

      <div v-if="error" class="activity-error" role="alert"><div><strong>{{ loaded ? '活动暂时未能刷新' : '活动加载失败' }}</strong><p>{{ loaded ? '保留上次内容，你可以稍后再试。' : '请检查网络，再试一次。' }}</p></div><button type="button" :disabled="loading" @click="loadActivities">{{ loading ? '重试中…' : '重新加载' }}</button></div>
      <LoadRow v-if="loading && !loaded" />
      <div v-if="list.length" class="activity-list">
        <router-link v-for="item in list" :key="item.id" :to="'/m/schedule/' + item.id" class="activity-card">
          <div class="activity-card-cover" :class="'cover-' + (activityKindOf(item)?.slug || 'club')"><div class="activity-cover-fallback" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M10 25c-6-5-4-13 2-13 4 0 6 3 8 5 2-2 4-5 8-5 6 0 8 8 2 13l-10 7-10-7Z"/></svg></div><img v-if="coverOf(item)" :src="coverOf(item)" :alt="item.route?.title || ''" loading="lazy" @error="hideBrokenImage" /><span>{{ activityKindOf(item)?.label || '同城活动' }}</span></div>
          <div class="activity-card-main"><p class="activity-card-date">{{ facts(item).dateLabel }} <b>{{ facts(item).timeLabel }}</b></p><h3>{{ item.route?.title || item.title }}</h3><p class="activity-card-place"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 6c0 4-5 8-5 8S3 10 3 6a5 5 0 1 1 10 0Z"/><circle cx="8" cy="6" r="1.6"/></svg><span>{{ [item.city, facts(item).place].filter(Boolean).join(' · ') || '地点待确认' }}</span></p><div class="activity-card-meta"><span v-if="item.private" class="activity-private">口令加入</span><span>{{ facts(item).phase }}</span><span>{{ facts(item).capacity }}</span></div><div class="activity-card-bottom"><span class="activity-card-host">{{ hostName(item) || '活动发起人' }}<small>发起</small></span><span class="activity-card-price" :class="{ free: facts(item).free }"><template v-if="facts(item).free">免费</template><template v-else><small>¥</small>{{ facts(item).price }}<em>/人</em></template><svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="m5 3 4 4-4 4"/></svg></span></div></div>
        </router-link>
      </div>
      <div v-else-if="loaded && !error" class="activity-empty"><span class="empty-orbit" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><circle cx="14" cy="14" r="8"/><path d="m20 20 7 7m-17-13h8m-4-4v8"/></svg></span><h3>{{ hasFilters ? '换个条件，遇见新的可能' : '第一场好时光，等你发起' }}</h3><p>{{ hasFilters ? '暂时没有符合条件的活动，试试其他时间或城区。' : '邀请兴趣相投的人，一起把日常过得有趣。' }}</p><button v-if="hasFilters" class="activity-secondary" type="button" @click="clearFilters">查看全部活动</button><button class="activity-primary" type="button" @click="goPublish()">{{ selectedKind?.publishLabel || '发起我的活动' }} <span aria-hidden="true">↗</span></button></div>
    </section>
    <footer class="activity-signature"><span></span>每一种热爱，都值得相遇<span></span></footer>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import http from '@/api/http';
import { useUserStore } from '@/stores/user';
import { ACTIVITY_KINDS, activityKindOf, activityRows, activityFacts } from '@/utils/activityKind';
import { coverOf, hostName } from '@/utils/feedCard';
import LoadRow from '@/components/LoadRow.vue';

const router = useRouter();
const route = useRoute();
const store = useUserStore();
const kinds = ACTIVITY_KINDS;
const rows = ref([]);
const kind = ref('');
const query = ref('');
const time = ref('');
const city = ref('');
const sort = ref('soon');
const freeOnly = ref(false);
const availableOnly = ref(false);
const filterOpen = ref(false);
const loaded = ref(false);
const loading = ref(false);
const error = ref(false);
const clock = ref(new Date());
const periods = [{ key: '', label: '全部' }, { key: 'today', label: '今天' }, { key: 'week', label: '本周' }, { key: 'weekend', label: '周末' }];
const selectedKind = computed(() => kinds.find((item) => item.key === kind.value));
const list = computed(() => activityRows(rows.value, { kind: kind.value, query: query.value, time: time.value, city: city.value, sort: sort.value, freeOnly: freeOnly.value, availableOnly: availableOnly.value }, clock.value));
const cities = computed(() => [...new Set([city.value, ...activityRows(rows.value, {}, clock.value).map((item) => item.city)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')));
const extraCount = computed(() => Number(!!city.value) + Number(freeOnly.value) + Number(availableOnly.value));
const hasFilters = computed(() => !!(kind.value || query.value.trim() || time.value || city.value || freeOnly.value || availableOnly.value || sort.value !== 'soon'));
let disposed = false;
let tick;
watch(() => route.query.kind, (value) => { kind.value = kinds.some((item) => item.key === value) ? value : ''; }, { immediate: true });
function facts(row) { return activityFacts(row, clock.value); }
function hideBrokenImage(event) { event.target.style.opacity = '0'; }
function selectKind(value) { const next = kind.value === value ? '' : value; kind.value = next; const query = { ...route.query }; if (next) query.kind = next; else delete query.kind; router.replace({ path: route.path, query }); }
function clearFilters() { kind.value = ''; query.value = ''; time.value = ''; city.value = ''; sort.value = 'soon'; freeOnly.value = false; availableOnly.value = false; const next = { ...route.query }; delete next.kind; router.replace({ path: route.path, query: next }); }
function goPublish() { const path = '/m/publish?channel=activity' + (kind.value ? '&kind=' + encodeURIComponent(kind.value) : ''); if (!store.token) router.push({ path: '/m/login', query: { redirect: path } }); else router.push(path); }
async function loadActivities() {
  if (loading.value || disposed) return;
  loading.value = true;
  error.value = false;
  try {
    const response = await http.get('/schedules', { params: { channel: 'activity' } });
    if (disposed) return;
    if (!Array.isArray(response.data)) throw new Error('Invalid activity list');
    rows.value = response.data;
    clock.value = new Date();
    loaded.value = true;
  } catch {
    if (!disposed) error.value = true;
  } finally {
    if (!disposed) loading.value = false;
  }
}
onMounted(() => { loadActivities(); tick = window.setInterval(() => { clock.value = new Date(); }, 30000); });
onUnmounted(() => { disposed = true; window.clearInterval(tick); });
</script>

<style scoped>
.activity-wish-entry { display:flex; align-items:center; gap:12px; margin:16px 0 0; padding:15px 16px; border:1px solid var(--ac-line); border-radius:18px; background:var(--ac-paper); color:var(--ac-purple); text-decoration:none; }
.activity-wish-entry .wish-entry-symbol { display:grid; place-items:center; flex:none; width:39px; height:39px; border-radius:13px; background:var(--ac-soft); font-size:28px; }
.activity-wish-entry > span:nth-child(2) { flex:1; min-width:0; }
.activity-wish-entry b { display:block; font-size:15px; font-weight:600; }
.activity-wish-entry small { display:block; margin-top:3px; font-size:11px; color:var(--ac-muted); }
.activity-wish-entry > span:last-child { font-size:22px; }

.activity-page { --ac-ink:#292530; --ac-muted:#8b8295; --ac-purple:#5b3b8c; --ac-paper:#fff; --ac-line:#e9e4ef; --ac-soft:#f4eff9; --ac-tint:#ece3f5; --ac-hero:linear-gradient(115deg,#eee7f7 0%,#f6f1fb 70%,#eee6f7 100%); max-width:1120px; margin:0 auto; padding:4px 0 20px; color:var(--ac-ink); font-size:calc(13px * var(--ui-scale,1)); line-height:1.5; overflow-wrap:anywhere; }
.activity-page *, .activity-page *::before, .activity-page *::after { box-sizing:border-box; }
.activity-page button, .activity-page select, .activity-page input { font:inherit; }
.activity-page button { cursor:pointer; -webkit-tap-highlight-color:transparent; }
.activity-page svg { display:block; flex:none; stroke:currentColor; stroke-width:1.45; stroke-linecap:round; stroke-linejoin:round; }
.activity-page h1, .activity-page h2, .activity-page h3, .activity-page p { margin:0; }
.activity-page strong, .activity-page b { color:inherit; background:transparent; }
.activity-page button:focus-visible, .activity-page a:focus-visible, .activity-page input:focus-visible, .activity-page select:focus-visible { outline:2px solid #9671bf; outline-offset:3px; }
.activity-page button:disabled { cursor:wait; opacity:.55; }
.activity-hero { position:relative; overflow:hidden; border:1px solid #e0d4ec; border-radius:22px; padding:19px 20px 0; color:var(--ac-purple); background:var(--ac-hero); }
.activity-hero-top { display:flex; justify-content:space-between; gap:12px; align-items:center; position:relative; z-index:1; font-size:calc(9px * var(--ui-scale,1)); }
.activity-hero-top > span:first-child { letter-spacing:.19em !important; opacity:.75; }
.activity-city { display:inline-flex; align-items:center; gap:5px; font-size:calc(10px * var(--ui-scale,1)); }
.activity-city i { width:4px; height:4px; border-radius:50%; background:currentColor; }
.activity-hero-main { display:flex; align-items:center; gap:5px; min-height:174px; }
.activity-hero-copy { position:relative; z-index:2; min-width:0; flex:1; padding:20px 0 25px; }
.activity-hero-copy h1 { font-size:calc(27px * var(--ui-scale,1)); letter-spacing:.015em !important; line-height:1.45; font-weight:600; text-wrap:balance; word-break:keep-all; overflow-wrap:normal; }
.activity-hero-copy p { margin-top:10px; font-size:calc(10px * var(--ui-scale,1)); color:#9681ab; }
.activity-hero-art { position:relative; flex:0 0 112px; height:145px; margin-right:-5px; }
.art-orbit { position:absolute; width:172px; height:172px; border:1px solid #dacbea; border-radius:50%; left:-22px; top:4px; }
.art-orbit::before { content:''; position:absolute; inset:16px; border:1px solid #e4d8ef; border-radius:50%; }
.art-ticket { position:absolute; top:24px; left:12px; width:76px; height:102px; border:1px solid #d0bfe5; border-radius:8px; background:#faf7ff; }
.art-ticket::before,.art-ticket::after { content:''; position:absolute; bottom:17px; width:9px; height:9px; border-radius:50%; background:#f0e9f8; }
.art-ticket::before { left:-5px; border-right:1px solid #d0bfe5; }
.art-ticket::after { right:-5px; border-left:1px solid #d0bfe5; }
.art-ticket.back { top:25px; left:6px; transform:rotate(-21deg); background:#e6dcf1; }
.art-ticket.back span { display:block; font-size:6px; letter-spacing:.13em !important; margin:10px 8px; }
.art-ticket.front { transform:rotate(12deg); left:30px; top:20px; box-shadow:0 9px 20px #72529612; }
.art-ticket.front svg { width:45px; height:45px; margin:12px auto 4px; stroke-width:1; }
.art-ticket.front span { display:block; text-align:center; font-size:6px; letter-spacing:.07em !important; }
.art-ticket i { position:absolute; bottom:21px; left:10px; right:10px; border-top:1px dashed #d7c6e9; }
.art-spark { position:absolute; width:12px; height:12px; top:3px; right:1px; transform:rotate(45deg); border:1px solid #b79ccc; }
.activity-hero-bottom { position:relative; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 0 14px; border-top:1px solid #dccde9; }
.activity-hero-bottom > span { font-size:calc(9px * var(--ui-scale,1)); color:#9580a9; }
.activity-hero-bottom button { display:flex; align-items:center; gap:4px; padding:0; border:0; background:transparent; color:var(--ac-purple); font-size:calc(11px * var(--ui-scale,1)); white-space:nowrap; }
.activity-hero-bottom svg { width:15px; height:15px; }
.activity-kinds { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin:20px 0 22px; }
.activity-kind { display:flex; flex-direction:column; align-items:center; justify-content:flex-start; position:relative; min-width:0; padding:12px 2px 14px; border:1px solid transparent; border-radius:17px; background:transparent; color:var(--ac-ink); text-align:center; }
.activity-kind.on { background:var(--ac-paper); border-color:var(--ac-line); box-shadow:0 4px 14px #6e4d9010; }
.activity-kind-icon { display:grid; place-items:center; width:50px; height:50px; margin:0 auto 9px; border-radius:17px; color:var(--ac-purple); background:#ece5f5; }
.activity-kind-icon svg { width:30px; height:30px; stroke-width:1.25; }
.kind-1 .activity-kind-icon { color:#6f8879; background:#eaf0eb; }
.kind-2 .activity-kind-icon { color:#a58b69; background:#f3ede6; }
.kind-3 .activity-kind-icon { color:#8092a1; background:#e9eef4; }
.activity-kind strong { display:block; font-size:calc(13px * var(--ui-scale,1)); font-weight:600; }
.activity-kind small { display:block; margin-top:3px; color:#80718f; font-size:calc(10px * var(--ui-scale,1)); }
.kind-indicator { position:absolute; bottom:4px; left:calc(50% - 6px); width:12px; height:2px; border-radius:4px; background:var(--ac-purple); }
.activity-theme { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:15px 17px; margin-top:-8px; margin-bottom:24px; border-left:2px solid #b49bce; border-radius:0 14px 14px 0; background:var(--ac-soft); }
.activity-theme > div { min-width:0; }
.activity-theme > div > span { color:#ab96bd; font-size:7px; letter-spacing:.15em !important; }
.activity-theme h2 { color:var(--ac-purple); font-size:calc(14px * var(--ui-scale,1)); font-weight:600; margin-top:4px; }
.activity-theme p { color:#776983; font-size:calc(12px * var(--ui-scale,1)); line-height:1.7; margin-top:5px; }
.activity-theme .activity-theme-note { margin-top:7px; font-size:calc(11px * var(--ui-scale,1)); color:#776983; line-height:1.65; }
.activity-theme > button { flex:none; padding:0; border:0; background:transparent; color:var(--ac-purple); font-size:calc(11px * var(--ui-scale,1)); }
.activity-theme > button span { display:block; margin-top:4px; text-align:right; font-size:19px; }
.activity-section-head { display:flex; justify-content:space-between; align-items:flex-end; gap:12px; margin-bottom:16px; }
.activity-section-head > div > span { display:block; color:#a28bb8; font-size:8px; letter-spacing:.17em !important; }
.activity-section-head h2 { margin-top:7px; font-size:calc(20px * var(--ui-scale,1)); font-weight:600; letter-spacing:.01em !important; }
.activity-result-count { color:var(--ac-muted); font-size:calc(10px * var(--ui-scale,1)); flex:none; padding-bottom:2px; }
.activity-search-row { display:flex; gap:9px; }
.activity-search { display:flex; align-items:center; gap:9px; min-width:0; flex:1; padding:0 12px; min-height:43px; background:var(--ac-paper); border:1px solid var(--ac-line); border-radius:12px; }
.activity-search svg { width:18px; height:18px; color:#9a89ab; }
.activity-search input { width:100%; min-width:0; padding:10px 0; border:0; color:var(--ac-ink); background:transparent; outline:none; font-size:calc(12px * var(--ui-scale,1)); }
.activity-search input::placeholder { color:#867b91; }
.activity-filter-toggle { flex:none; display:flex; justify-content:center; align-items:center; gap:4px; padding:8px; border:1px solid var(--ac-line); border-radius:12px; background:var(--ac-paper); color:#80718f; font-size:calc(10px * var(--ui-scale,1)); }
.activity-filter-toggle svg { width:18px; height:18px; }
.activity-filter-toggle span { display:flex; gap:2px; align-items:center; }
.activity-filter-toggle small { min-width:13px; height:13px; border-radius:50%; color:var(--ac-paper); background:var(--ac-purple); font-size:9px; line-height:13px; text-align:center; }
.activity-filter-toggle.on { border-color:#c5b1dc; color:var(--ac-purple); background:var(--ac-soft); }
.activity-filter-line { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:13px 0 15px; }
.activity-dates { display:flex; gap:5px; flex-wrap:wrap; }
.activity-dates button { border:0; background:transparent; color:#8f849b; font-size:calc(11px * var(--ui-scale,1)); padding:5px 9px; border-radius:7px; }
.activity-dates button.on { color:var(--ac-purple); background:#eae2f3; font-weight:600; }
.activity-sort { display:flex; align-items:center; gap:3px; flex:none; max-width:45%; color:#9b90a5; }
.activity-sort select { max-width:100%; appearance:none; border:0; border-radius:0; background:transparent; color:inherit; padding:3px 0; font-size:calc(10px * var(--ui-scale,1)); }
.activity-sort svg { width:10px; height:10px; }
.visually-hidden { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }
.activity-more-filters { padding:15px 16px; margin:0 0 14px; border:1px solid var(--ac-line); border-radius:13px; background:var(--ac-paper); }
.activity-more-filters > label { display:flex; gap:16px; align-items:center; justify-content:space-between; font-size:calc(11px * var(--ui-scale,1)); color:var(--ac-muted); }
.activity-more-filters select { max-width:65%; min-width:120px; border:1px solid var(--ac-line); border-radius:8px; padding:7px 10px; background:var(--ac-soft); color:var(--ac-ink); font-size:inherit; }
.activity-filter-toggles { display:flex; align-items:center; gap:25px; margin-top:15px; }
.activity-filter-toggles button { display:flex; align-items:center; gap:7px; border:0; background:transparent; color:var(--ac-muted); padding:0; font-size:calc(11px * var(--ui-scale,1)); }
.activity-filter-toggles i { display:grid; place-items:center; width:15px; height:15px; border:1px solid #d5cadf; border-radius:4px; font-size:10px; font-style:normal; }
.activity-filter-toggles .on { color:var(--ac-purple); }
.activity-filter-toggles .on i { color:#fff; border-color:var(--ac-purple); background:var(--ac-purple); }
.activity-more-filters > p { margin-top:13px; font-size:calc(10px * var(--ui-scale,1)); color:#a79bae; }
.activity-applied { display:flex; align-items:center; justify-content:space-between; gap:14px; margin:0 0 13px; font-size:calc(10px * var(--ui-scale,1)); color:#9d8bb0; }
.activity-applied > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.activity-applied button { flex:none; padding:0; border:0; background:transparent; color:var(--ac-purple); font-size:inherit; }
.activity-applied button span { margin-left:4px; font-size:14px; }
.activity-list { display:grid; gap:13px; }
.activity-card { display:flex; gap:13px; min-width:0; padding:12px; border:1px solid #eeebf3; border-radius:17px; color:var(--ac-ink); background:var(--ac-paper); text-decoration:none; transition:border-color .15s,transform .15s; }
.activity-card:hover { border-color:#cbb7df; transform:translateY(-1px); }
.activity-card-cover { position:relative; flex:0 0 96px; min-height:136px; overflow:hidden; border-radius:11px; background:linear-gradient(145deg,#e5dcec,#f4eef9); }
.activity-card-cover.cover-run { background:linear-gradient(145deg,#d7e5dc,#edf2ed); }
.activity-card-cover.cover-movie { background:linear-gradient(145deg,#ddd3c5,#f4eee5); }
.activity-card-cover.cover-club { background:linear-gradient(145deg,#d7e1ec,#edf1f7); }
.activity-card-cover > img { position:absolute; width:100%; height:100%; object-fit:cover; }
.activity-card-cover > span { position:absolute; left:7px; top:7px; max-width:calc(100% - 14px); border:1px solid #ffffff75; border-radius:5px; color:#665075; background:#fffffff0; padding:3px 5px; font-size:calc(9px * var(--ui-scale,1)); }
.activity-cover-fallback { display:grid; place-items:center; position:absolute; inset:0; color:#b7a4cb; }
.activity-cover-fallback svg { width:55px; height:55px; stroke-width:1; }
.activity-card-main { min-width:0; flex:1; display:flex; flex-direction:column; }
.activity-card-date { color:#9d84b5; font-size:calc(10px * var(--ui-scale,1)); line-height:1.5; }
.activity-card-date b { margin-left:3px; color:var(--ac-purple); font-weight:500; }
.activity-card h3 { margin-top:5px; font-size:calc(15px * var(--ui-scale,1)); font-weight:600; line-height:1.45; }
.activity-card-place { display:flex; align-items:flex-start; gap:4px; margin-top:7px !important; color:var(--ac-muted); font-size:calc(11px * var(--ui-scale,1)); line-height:1.5; }
.activity-card-place svg { width:12px; height:12px; margin-top:2px; }
.activity-card-place > span { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.activity-card-meta { display:flex; align-items:center; flex-wrap:wrap; gap:5px; margin-top:9px; font-size:calc(10px * var(--ui-scale,1)); color:#8e7a9f; }
.activity-card-meta > span { display:inline-block; padding:2px 5px; border-radius:4px; background:var(--ac-soft); }
.activity-card-meta .activity-private { color:#7a858d; background:#edf1f4; }
.activity-card-bottom { display:flex; align-items:center; justify-content:space-between; gap:5px; margin-top:auto; padding-top:12px; }
.activity-card-host { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:calc(10px * var(--ui-scale,1)); color:#8f839b; min-width:0; }
.activity-card-host small { font-size:calc(8px * var(--ui-scale,1)); margin-left:4px; color:#b0a6b9; }
.activity-card-price { display:flex; align-items:center; flex:none; color:var(--ac-purple); font-size:calc(18px * var(--ui-scale,1)); font-weight:600; line-height:1.2; gap:1px; }
.activity-card-price > small { font-size:calc(11px * var(--ui-scale,1)); font-weight:400; align-self:flex-end; padding-bottom:1px; }
.activity-card-price > em { color:#a59aaf; font-size:calc(9px * var(--ui-scale,1)); font-style:normal; font-weight:400; margin:0 2px; align-self:flex-end; padding-bottom:1px; }
.activity-card-price > svg { width:12px; height:12px; color:#b9a9c7; margin-left:3px; }
.activity-card-price.free { font-size:calc(15px * var(--ui-scale,1)); }
.activity-error { display:flex; align-items:center; justify-content:space-between; gap:14px; margin:4px 0 15px; padding:15px; border-radius:12px; background:var(--ac-soft); }
.activity-error strong { font-size:calc(13px * var(--ui-scale,1)); font-weight:500; }
.activity-error p { margin-top:4px; color:var(--ac-muted); font-size:calc(11px * var(--ui-scale,1)); }
.activity-error button { border:1px solid #d7c4e5; border-radius:8px; background:var(--ac-paper); color:var(--ac-purple); padding:7px 9px; font-size:calc(11px * var(--ui-scale,1)); flex:none; }
.activity-empty { padding:32px 20px; margin:4px 0 0; border:1px solid var(--ac-line); border-radius:18px; background:var(--ac-paper); text-align:center; }
.empty-orbit { display:grid; place-items:center; width:64px; height:64px; margin:0 auto 17px; border:1px solid #e7dcf0; border-radius:50%; color:#a48aba; background:var(--ac-soft); }
.empty-orbit svg { width:32px; height:32px; stroke-width:1.1; }
.activity-empty h3 { font-size:calc(16px * var(--ui-scale,1)); font-weight:500; }
.activity-empty p { margin:9px auto 20px; color:var(--ac-muted); font-size:calc(11px * var(--ui-scale,1)); max-width:260px; line-height:1.8; }
.activity-primary, .activity-secondary { display:inline-flex; align-items:center; justify-content:center; gap:16px; min-height:39px; padding:8px 17px; border:1px solid var(--ac-purple); border-radius:22px; font-size:calc(12px * var(--ui-scale,1)) !important; }
.activity-primary { background:var(--ac-purple); color:#fff; }
.activity-secondary { background:transparent; color:var(--ac-purple); margin:0 5px 8px; }
.activity-signature { display:flex; align-items:center; justify-content:center; gap:10px; color:#b8a7c5; font-size:calc(9px * var(--ui-scale,1)); letter-spacing:.06em !important; margin-top:27px; }
.activity-signature > span { width:22px; height:1px; background:#e0d6e8; }
:global(html[data-night="dark"] .activity-page) { --ac-ink:#ede8f4; --ac-muted:#a99bb7; --ac-purple:#cfb3ee; --ac-paper:#211c29; --ac-line:#393041; --ac-soft:#2d2439; --ac-tint:#382b48; --ac-hero:linear-gradient(115deg,#30233f 0%,#251e31 70%,#30223d 100%); }
:global(html[data-night="dark"] .mp-phone.is-account .activity-page strong) { background:transparent; color:inherit; }
:global(html[data-night="dark"] .activity-hero) { border-color:#473451; }
:global(html[data-night="dark"] .activity-hero-bottom) { border-color:#4a375b; }
:global(html[data-night="dark"] .activity-kind-icon) { background:#392a4b; }
:global(html[data-night="dark"] .activity-theme p), :global(html[data-night="dark"] .activity-kind small) { color:#b9a9c8; }
:global(html[data-night="dark"] .kind-1 .activity-kind-icon) { background:#273c34; color:#a8c6b3; }
:global(html[data-night="dark"] .kind-2 .activity-kind-icon) { background:#3c3228; color:#c9b69e; }
:global(html[data-night="dark"] .kind-3 .activity-kind-icon) { background:#2a3442; color:#b1c7dd; }
:global(html[data-night="dark"] .activity-dates button.on) { background:#382948; }
:global(html[data-night="dark"] .activity-card) { border-color:#352b3e; }
:global(html[data-night="dark"] .activity-filter-toggles .on i) { color:#23182e; }
:global(html[data-night="dark"] .activity-primary) { color:#23182e; }
:global(html[data-night="dark"] .activity-card-meta .activity-private) { background:#29343c; color:#b2bfc9; }
:global(html[data-text="1"] .activity-hero-art), :global(html[data-text="1"] .activity-card-cover) { display:none; }
@media (max-width:360px) {
  .activity-hero { padding-left:16px; padding-right:16px; }
  .activity-hero-copy h1 { font-size:calc(24px * var(--ui-scale,1)); }
  .activity-hero-art { flex-basis:80px; margin-right:5px; transform:scale(.85); transform-origin:center right; }
  .activity-hero-main { min-height:163px; }
  .activity-hero-bottom { gap:7px; }
  .activity-hero-bottom > span { font-size:calc(8px * var(--ui-scale,1)); }
  .activity-kinds { gap:3px; }
  .activity-kind strong { font-size:calc(12px * var(--ui-scale,1)); }
  .activity-kind small { font-size:calc(10px * var(--ui-scale,1)); }
  .activity-section-head { align-items:flex-start; flex-wrap:wrap; gap:5px; }
  .activity-section-head > div { flex-basis:100%; }
  .activity-section-head h2 { font-size:calc(18px * var(--ui-scale,1)); }
  .activity-card { gap:10px; padding:10px; }
  .activity-card-cover { flex-basis:78px; }
  .activity-card h3 { font-size:calc(14px * var(--ui-scale,1)); }
  .activity-dates { gap:1px; }
  .activity-dates button { padding:5px 7px; }
  .activity-filter-toggle { flex-direction:column; gap:1px; padding:6px 8px; }
  .activity-theme { flex-direction:column; align-items:stretch; }
  .activity-theme > button { align-self:flex-end; }
  .activity-theme > button span { display:inline; margin-left:9px; }
}
@media (min-width:700px) {
  .activity-page { padding:10px 16px 35px; }
  .activity-hero { padding:23px 32px 0; }
  .activity-hero-main { min-height:215px; }
  .activity-hero-copy h1 { font-size:calc(35px * var(--ui-scale,1)); }
  .activity-hero-copy h1 br { display:none; }
  .activity-hero-copy p { font-size:calc(13px * var(--ui-scale,1)); margin-top:13px; }
  .activity-hero-art { margin-right:40px; transform:scale(1.2); }
  .activity-hero-bottom { padding-bottom:18px; }
  .activity-hero-bottom > span, .activity-hero-bottom button { font-size:calc(12px * var(--ui-scale,1)); }
  .activity-kinds { margin:22px 0 28px; gap:16px; }
  .activity-kind { display:grid; grid-template-columns:54px 1fr; column-gap:14px; padding:17px 20px; text-align:left; background:var(--ac-paper); border-color:var(--ac-line); }
  .activity-kind-icon { grid-row:1/3; margin:0; width:50px; height:50px; }
  .activity-kind strong { align-self:end; font-size:calc(15px * var(--ui-scale,1)); }
  .activity-kind small { font-size:calc(11px * var(--ui-scale,1)); }
  .kind-indicator { bottom:9px; left:89px; }
  .activity-kind.on { border-color:#bea6d6; background:var(--ac-soft); }
  .activity-theme { margin-top:-7px; padding:19px 22px; }
  .activity-theme h2 { font-size:calc(17px * var(--ui-scale,1)); }
  .activity-theme p { font-size:calc(12px * var(--ui-scale,1)); }
  .activity-list { grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
  .activity-card-cover { flex-basis:110px; min-height:155px; }
  .activity-card h3 { font-size:calc(16px * var(--ui-scale,1)); }
  .activity-card-date, .activity-card-place, .activity-card-host { font-size:calc(11px * var(--ui-scale,1)); }
  .activity-more-filters { display:flex; align-items:center; flex-wrap:wrap; gap:20px; }
  .activity-filter-toggles { margin-top:0; }
  .activity-more-filters > p { margin-top:0; margin-left:auto; }
}
@media (prefers-reduced-motion:reduce) { .activity-card { transition:none; } }
</style>
