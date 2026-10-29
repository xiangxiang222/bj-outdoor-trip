<template>
  <div class="discovery-page">
    <header class="discovery-intro">
      <span class="discovery-eyebrow"><TravelIcon name="compass" /> FIND YOUR KIND OF JOURNEY</span>
      <h1>想怎么玩，<br /><span>说给我们听。</span></h1>
      <p>把时间、预算和期待，变成下一程。</p>
      <router-link class="discovery-manual" to="/m">自己筛选 <TravelIcon name="arrow" /></router-link>
    </header>

    <form class="discovery-composer" @submit.prevent="searchMessage">
      <label for="discovery-message">说说你想怎么玩</label>
      <textarea id="discovery-message" ref="messageInput" v-model="message" data-testid="discovery-message" rows="3" maxlength="400" placeholder="例如：下周末想去长城，一个人，团费 200 元以内，想轻松一点" :aria-describedby="messageHelp" />
      <div class="discovery-composer-foot"><span id="discovery-message-help">{{ message.length }} / 400</span><button class="discovery-primary" data-testid="discovery-submit" type="submit" :disabled="busy || !message.trim()"><span v-if="busy" class="discovery-spinner" aria-hidden="true"></span>{{ busy ? '正在找合适的团…' : '找找我的下一程' }}<TravelIcon v-if="!busy" name="arrow" /></button></div>
    </form>

    <div class="discovery-examples" aria-label="试试这样说"><span>试试这样说</span><button v-for="example in examples" :key="example" type="button" @click="useExample(example)">{{ example }} <span aria-hidden="true">↗</span></button></div>
    <p class="discovery-trust"><TravelIcon name="shield" /> 只找真实团期，报名时再核对费用与余位。</p>

    <div v-if="error" class="discovery-error" role="alert"><div><strong>这次没有找成功</strong><p>{{ error }}</p></div><button data-testid="discovery-retry" type="button" :disabled="busy" @click="retry">重新试试</button></div>

    <section v-if="response" ref="resultSection" class="discovery-response" data-testid="discovery-results" :aria-busy="busy" aria-label="找团结果">
      <div class="discovery-result-heading"><div><span class="discovery-eyebrow">YOUR NEXT JOURNEY</span><h2>这一程，更合你意</h2></div><span class="discovery-mode">{{ ['model', 'ai', 'llm'].includes(response.mode) ? '已整理你的出发偏好' : '已按描述整理条件' }}</span></div>
      <div class="discovery-condition-card">
        <div class="discovery-condition-heading"><h3>先确认这些条件</h3><button data-testid="discovery-edit" type="button" :aria-expanded="editing" aria-controls="discovery-filter-form" @click="toggleEdit">{{ editing ? '收起条件' : '修改条件' }}<TravelIcon name="filter" /></button></div>
        <div class="discovery-conditions"><span v-for="condition in response.conditions || []" :key="condition.key">{{ condition.label }}</span><span v-if="!response.conditions?.length">暂未限定条件</span></div>
        <p v-if="response.question" class="discovery-question"><TravelIcon name="compass" />{{ response.question }}</p>
        <form v-if="editing" id="discovery-filter-form" class="discovery-filter-form" @submit.prevent="applyFilters" novalidate>
          <div class="discovery-fields">
            <label>出发时间<select id="discovery-time" v-model="draft.time" name="departureTime"><option value="any">不限日期</option><option value="weekend">本周末</option><option value="nextweekend">下周末</option><option value="date">指定一天</option><option value="range">一段时间</option></select></label>
            <label>目的地<input id="discovery-destination" v-model="draft.destination" name="destination" maxlength="40" placeholder="不限目的地" /></label>
            <label v-if="draft.time === 'date' || draft.time === 'range'">{{ draft.time === 'range' ? '开始日期' : '出发日期' }}<input id="discovery-from" v-model="draft.dateFrom" name="dateFrom" type="date" :min="today" required /></label>
            <label v-if="draft.time === 'range'">结束日期<input id="discovery-to" v-model="draft.dateTo" name="dateTo" type="date" :min="draft.dateFrom || today" required /></label>
            <label>人均团费上限<input id="discovery-budget" v-model="draft.budgetMax" name="budgetMax" inputmode="decimal" type="number" min="0" max="100000" step="any" placeholder="不限，免费填 0" /></label>
            <label>同行人数<input id="discovery-party" v-model="draft.partySize" name="partySize" inputmode="numeric" type="number" min="1" max="50" step="1" required /></label>
            <label>线路强度<select id="discovery-intensity" v-model="draft.intensity" name="intensity"><option value="any">不限强度</option><option value="easy">资料标注休闲</option></select></label>
            <label>团型<select id="discovery-host" v-model="draft.hostKind" name="hostKind"><option value="any">全部团型</option><option value="official">官方团</option><option value="campus">高校团</option><option value="company">公司团</option><option value="individual">个人团</option></select></label>
            <label>校园偏好<select id="discovery-scope" v-model="draft.campusScope" name="campusScope"><option value="any">不限校园范围</option><option value="cross">跨校或高校联谊</option></select></label>
          </div>
          <p class="discovery-field-note">预算按每人团费筛选，另付项目请看费用说明。</p>
          <p v-if="formError" class="discovery-form-error" role="alert">{{ formError }}</p>
          <button class="discovery-primary discovery-apply" data-testid="discovery-apply-filters" type="submit" :disabled="busy">应用这些条件 <TravelIcon name="arrow" /></button>
        </form>
      </div>
      <div v-if="response.warnings?.length" class="discovery-warnings"><p v-for="warning in response.warnings" :key="warning">{{ warning }}</p></div>

      <div v-if="results.length" class="discovery-list-heading"><span>找到 <strong>{{ response.total }}</strong> 个符合条件的团</span><button v-if="results.length > 1" data-testid="discovery-compare" type="button" :disabled="selectedIds.length < 2" @click="openComparison">比较这几程 <span>{{ selectedIds.length }} / 3</span></button></div>
      <div class="discovery-result-grid">
        <article v-for="row in results" :key="row.id" class="discovery-trip" data-testid="discovery-card">
          <router-link class="discovery-trip-main" :to="'/m/schedule/' + row.id">
            <div class="discovery-trip-image"><img v-if="row.cover" :src="mediaSrc(row.cover)" :alt="row.title" loading="lazy" /><TravelIcon v-else name="mountain" /><span>{{ row.region || '目的地待确认' }}</span><span class="discovery-participation" :class="row.participation?.status">{{ row.participation?.label || '查看本团安排' }}</span></div>
            <div class="discovery-trip-body"><div class="discovery-trip-date"><TravelIcon name="calendar" /><span>{{ row.startDate }} <template v-if="row.meetupTime">· {{ row.meetupTime }}</template></span></div><h3>{{ row.title }}</h3><div class="discovery-trip-meta"><span v-if="row.days">{{ row.days }} 天</span><span v-if="row.difficulty">{{ row.difficulty }}</span><span v-if="row.eligibilityLabel">{{ row.eligibilityLabel }}</span><span class="discovery-trip-remain"><span>当前余位</span> {{ row.remain == null ? '暂未提供' : row.remain }}</span></div><ul v-if="row.reasons?.length" class="discovery-reasons"><li v-for="reason in row.reasons.slice(0, 2)" :key="reason"><TravelIcon name="check" />{{ reason }}</li></ul><p v-if="row.participation?.reason" class="discovery-caution">{{ row.participation.reason }}</p><p v-if="row.cautions?.length" class="discovery-caution">{{ row.cautions[0] }}</p><div class="discovery-trip-price"><div><strong v-if="row.price?.amount != null">¥{{ row.price.amount }}</strong><strong v-else class="discovery-unknown-price">费用待确认</strong><small>{{ row.price?.label || '当前人均团费' }}</small></div><span>查看详情 <TravelIcon name="arrow" /></span></div><p class="discovery-price-note">{{ row.price?.note || '以报名页实时核算为准' }}</p></div>
          </router-link>
          <div class="discovery-trip-actions"><label><input type="checkbox" :checked="selectedIds.includes(row.id)" :disabled="!selectedIds.includes(row.id) && selectedIds.length >= 3" @change="toggleCompare(row.id)" /><span>加入对比</span></label><router-link v-if="row.participation?.status === 'verify'" :to="'/m/schedule/' + row.id" @click="rememberForReturn">核对参与条件 <span aria-hidden="true">↗</span></router-link></div>
        </article>
      </div>

      <div v-if="!results.length && !busy" class="discovery-empty"><span class="discovery-empty-icon"><TravelIcon name="compass" /></span><h3>这次暂时没有完全合适的团</h3><p>保留你的条件，换个日期或偏好再看看。</p><div class="discovery-empty-actions"><button type="button" @click="editAndFocus">修改条件</button><button v-if="hasTime" type="button" @click="relax('time')">清除日期限制</button><button v-if="response.filters?.budgetMax != null" type="button" @click="relax('budget')">清除团费上限</button><button v-if="hasScope" type="button" @click="relax('scope')">清除团型与校园偏好</button></div><router-link to="/m?view=routes">先看精选线路 <TravelIcon name="arrow" /></router-link></div>
      <button v-if="response.hasMore" class="discovery-more" data-testid="discovery-more" type="button" :disabled="busy" @click="loadMore">{{ busy ? '正在查找…' : '按这些条件查看更多' }}<TravelIcon v-if="!busy" name="arrow" /></button>

      <section v-if="comparing && compared.length >= 2" ref="comparisonSection" class="discovery-comparison" aria-label="真实方案对比" tabindex="-1"><div class="discovery-compare-heading"><div><span class="discovery-eyebrow">A LITTLE COMPARISON</span><h2>看清差别，再选喜欢的。</h2></div><button type="button" aria-label="关闭对比" @click="comparing = false">×</button></div><p class="discovery-compare-note">根据当前线路资料对比；缺失信息标为「暂未提供」。</p><div class="discovery-compare-grid" :style="{ '--compare-columns': compared.length }"><article v-for="row in compared" :key="row.id"><h3>{{ row.title }}</h3><dl><div v-for="field in discoveryComparison(row)" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></div></dl><router-link :to="'/m/schedule/' + row.id">查看这一程 <TravelIcon name="arrow" /></router-link></article></div></section>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import http from "@/api/http";
import TravelIcon from "@/components/TravelIcon.vue";
import { mediaSrc } from "@/utils/media";
import { chinaDay } from "@/utils/departureDates";
import { setChrome } from "@/utils/pageChrome";
import { discoveryComparison, discoveryDraft, emptyDiscoveryFilters, mergeDiscoveryResults, validateDiscoveryDraft } from "@/utils/discoveryState";

const message = ref("");
const messageInput = ref(null);
const messageHelp = "discovery-message-help";
const examples = ["本周末轻徒步", "下周末长城，团费200元内", "想参加跨校团"];
const busy = ref(false);
const error = ref("");
const formError = ref("");
const editing = ref(false);
const response = ref(null);
const results = ref([]);
const draft = reactive(discoveryDraft());
const selectedIds = ref([]);
const comparing = ref(false);
const resultSection = ref(null);
const comparisonSection = ref(null);
const today = computed(() => chinaDay(new Date()));
const hasTime = computed(() => response.value?.filters?.time !== "any");
const hasScope = computed(() => response.value?.filters?.hostKind !== "any" || response.value?.filters?.campusScope !== "any");
const compared = computed(() => results.value.filter((row) => selectedIds.value.includes(row.id)).slice(0, 3));
let requestVersion = 0;
let controller;
let lastRequest;
let disposed = false;
const returnStorageKey = "bj_discovery_return";
onMounted(() => {
  setChrome("一句话找团", "说说期待，找到真实可参与的一程");
  try {
    const saved = JSON.parse(sessionStorage.getItem(returnStorageKey) || "null");
    sessionStorage.removeItem(returnStorageKey);
    if (saved?.filters) {
      message.value = String(saved.message || "").slice(0, 400);
      const checked = validateDiscoveryDraft(discoveryDraft(saved.filters), today.value);
      if (checked.filters) runSearch({ filters: checked.filters, limit: 3, offset: 0 });
    }
  } catch { /* Session storage may be disabled in private mode. */ }
});
onBeforeUnmount(() => { disposed = true; requestVersion++; controller?.abort(); });

function useExample(example) {
  message.value = example;
  messageInput.value?.focus();
}
function rememberForReturn() {
  try { sessionStorage.setItem(returnStorageKey, JSON.stringify({ message: message.value, filters: response.value?.filters })); } catch { /* The return path still works without storage. */ }
}
async function searchMessage() {
  if (!message.value.trim() || busy.value) return;
  await runSearch({ message: message.value.trim(), limit: 3, offset: 0 });
}
async function runSearch(payload, append = false) {
  const version = ++requestVersion;
  controller?.abort();
  controller = new AbortController();
  lastRequest = { payload: structuredClone(payload), append };
  busy.value = true;
  error.value = "";
  formError.value = "";
  try {
    const result = await http.post("/discovery/search", payload, { signal: controller.signal });
    if (disposed || version !== requestVersion) return;
    const data = result.data;
    if (!data || !data.filters || !Array.isArray(data.results)) throw new Error("找团结果暂时不可用，请重试");
    const rows = mergeDiscoveryResults(append ? results.value : [], data.results);
    results.value = rows;
    response.value = data;
    Object.assign(draft, discoveryDraft(data.filters));
    editing.value = Boolean(data.question);
    if (!append) { selectedIds.value = rows.slice(0, 3).map((row) => row.id); comparing.value = false; }
    if (!append) { await nextTick(); resultSection.value?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  } catch (e) {
    if (disposed || version !== requestVersion) return;
    error.value = e.message || "网络暂时不稳定，请稍后重试";
  } finally {
    if (!disposed && version === requestVersion) busy.value = false;
  }
}
function retry() {
  if (busy.value) return;
  if (lastRequest) runSearch(lastRequest.payload, lastRequest.append);
  else searchMessage();
}
function toggleEdit() {
  if (!editing.value) Object.assign(draft, discoveryDraft(response.value?.filters));
  editing.value = !editing.value;
  formError.value = "";
}
async function editAndFocus() {
  editing.value = true;
  Object.assign(draft, discoveryDraft(response.value?.filters));
  await nextTick();
  document.getElementById("discovery-filter-form")?.querySelector("select")?.focus();
}
function applyFilters() {
  if (busy.value) return;
  const checked = validateDiscoveryDraft(draft, today.value);
  if (checked.error) { formError.value = checked.error; return; }
  runSearch({ filters: checked.filters, limit: 3, offset: 0 });
}
function loadMore() {
  if (busy.value || !response.value?.hasMore) return;
  runSearch({ filters: { ...emptyDiscoveryFilters(), ...response.value.filters }, limit: 3, offset: response.value.nextOffset ?? results.value.length }, true);
}
function relax(key) {
  if (busy.value) return;
  const filters = { ...emptyDiscoveryFilters(), ...response.value.filters };
  if (key === "time") Object.assign(filters, { time: "any", dateFrom: "", dateTo: "" });
  if (key === "budget") filters.budgetMax = null;
  if (key === "scope") Object.assign(filters, { hostKind: "any", campusScope: "any" });
  runSearch({ filters, limit: 3, offset: 0 });
}
function toggleCompare(id) {
  if (selectedIds.value.includes(id)) selectedIds.value = selectedIds.value.filter((value) => value !== id);
  else if (selectedIds.value.length < 3) selectedIds.value.push(id);
  if (selectedIds.value.length < 2) comparing.value = false;
}
async function openComparison() {
  comparing.value = true;
  await nextTick();
  comparisonSection.value?.scrollIntoView({ behavior: "smooth", block: "start" });
  comparisonSection.value?.focus({ preventScroll: true });
}
</script>

<style scoped>
.discovery-page { --d-purple:#5b3b8c; --d-ink:#302738; --d-muted:#92849f; --d-bg:#f7f5fa; --d-paper:#fff; --d-soft:#f0eaf7; --d-line:#e9e1f0; background:var(--d-bg); color:var(--d-ink); padding:28px 20px 48px; min-height:70vh; font-size:calc(14px * var(--ui-scale,1)); overflow-wrap:anywhere; }
.discovery-page *, .discovery-page *::before, .discovery-page *::after { box-sizing:border-box; }
.discovery-page button, .discovery-page input, .discovery-page textarea, .discovery-page select { font:inherit; }
.discovery-page button { cursor:pointer; color:inherit; }
.discovery-page button:disabled { opacity:.5; cursor:default; }
.discovery-page button:focus-visible, .discovery-page a:focus-visible { outline:2px solid #ad90c7; outline-offset:4px; }
.discovery-page .travel-icon { width:19px; height:19px; flex:none; stroke-width:1.45; }
.discovery-intro { position:relative; padding:6px 0 27px; }
.discovery-eyebrow { display:flex; align-items:center; gap:7px; font-size:10px; color:var(--d-muted); line-height:1.7; letter-spacing:.1em; }
.discovery-eyebrow .travel-icon { width:17px; height:17px; color:var(--d-purple); }
.discovery-intro h1 { font-size:calc(36px * var(--ui-scale,1)); line-height:1.35; font-weight:550; letter-spacing:-.04em; margin:19px 0 14px; color:var(--d-ink); }
.discovery-intro h1 span { color:var(--d-purple); }
.discovery-intro p { color:var(--d-muted); font-size:calc(13px * var(--ui-scale,1)); line-height:1.8; margin:0; }
.discovery-manual { display:inline-flex; gap:8px; align-items:center; margin-top:18px; font-size:calc(12px * var(--ui-scale,1)); color:var(--d-purple); }
.discovery-manual .travel-icon { width:16px; height:16px; }
.discovery-composer { padding:21px 19px 16px; border:1px solid #d9cbe6; border-radius:19px; background:var(--d-paper); box-shadow:0 10px 35px #60417b08; }
.discovery-composer > label { display:block; color:var(--d-purple); font-size:calc(13px * var(--ui-scale,1)); font-weight:500; margin-bottom:12px; }
.discovery-composer textarea { display:block; width:100%; min-height:106px; resize:vertical; max-height:300px; padding:0; border:0; outline:none; line-height:1.9; color:var(--d-ink); background:transparent; font-size:calc(15px * var(--ui-scale,1)); }
.discovery-composer textarea::placeholder { color:#b2a6bc; }
.discovery-composer:focus-within { border-color:#aa8bc8; }
.discovery-composer-foot { display:flex; justify-content:space-between; gap:12px; align-items:center; border-top:1px solid var(--d-line); padding-top:14px; margin-top:11px; }
.discovery-composer-foot > span { color:#b1a2bc; font-size:calc(10px * var(--ui-scale,1)); white-space:nowrap; }
.discovery-primary { display:inline-flex; align-items:center; justify-content:center; gap:10px; padding:12px 18px; border:1px solid var(--d-purple); border-radius:99px; background:var(--d-purple); color:var(--d-paper) !important; font-size:calc(13px * var(--ui-scale,1)) !important; line-height:1.6; }
.discovery-primary .travel-icon { width:17px; height:17px; }
.discovery-examples { display:flex; flex-wrap:wrap; gap:8px; margin:17px 0 13px; }
.discovery-examples > span { width:100%; color:var(--d-muted); font-size:calc(10px * var(--ui-scale,1)); margin-bottom:1px; }
.discovery-examples button { padding:8px 10px; border:1px solid var(--d-line); background:var(--d-paper); color:#8c739f; border-radius:8px; font-size:calc(11px * var(--ui-scale,1)); line-height:1.7; text-align:left; }
.discovery-examples button span { margin-left:3px; color:#b4a0c3; }
.discovery-trust { display:flex; align-items:flex-start; gap:6px; margin:15px 0 0; font-size:calc(10px * var(--ui-scale,1)); color:#a997b6; line-height:1.8; }
.discovery-trust .travel-icon { width:15px; height:15px; margin-top:1px; }
.discovery-error { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:25px; padding:16px; background:var(--d-paper); border:1px solid #dec9da; border-radius:14px; }
.discovery-error strong { color:#915c78; font-size:calc(13px * var(--ui-scale,1)); font-weight:500; }.discovery-error p { color:var(--d-muted); font-size:calc(11px * var(--ui-scale,1)); margin:6px 0 0; line-height:1.7; }.discovery-error button { flex:none; border:1px solid var(--d-line); border-radius:99px; padding:9px 13px; color:var(--d-purple); background:var(--d-paper); font-size:calc(11px * var(--ui-scale,1)); }
.discovery-response { margin-top:37px; scroll-margin-top:18px; }
.discovery-result-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin-bottom:18px; }.discovery-result-heading h2 { font-size:calc(22px * var(--ui-scale,1)); font-weight:550; line-height:1.5; margin:8px 0 0; }.discovery-mode { color:#ad9aba; font-size:calc(10px * var(--ui-scale,1)); line-height:1.7; max-width:37%; text-align:right; }
.discovery-condition-card { background:var(--d-paper); border:1px solid var(--d-line); border-radius:15px; padding:18px 17px; }.discovery-condition-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; }.discovery-condition-heading h3 { font-size:calc(13px * var(--ui-scale,1)); font-weight:500; margin:0; }.discovery-condition-heading button { display:flex; align-items:center; gap:5px; flex:none; font-size:calc(11px * var(--ui-scale,1)); color:var(--d-purple); background:transparent; border:0; padding:4px 0; }.discovery-condition-heading .travel-icon { width:15px; height:15px; }
.discovery-conditions { display:flex; flex-wrap:wrap; gap:7px; margin-top:14px; }.discovery-conditions > span { border-radius:6px; background:var(--d-soft); color:#826697; font-size:calc(11px * var(--ui-scale,1)); padding:6px 9px; line-height:1.7; }
.discovery-question { display:flex; align-items:flex-start; gap:7px; color:var(--d-purple); margin:15px 0 0; font-size:calc(12px * var(--ui-scale,1)); line-height:1.8; }.discovery-question .travel-icon { width:17px; height:17px; margin-top:2px; }
.discovery-filter-form { border-top:1px solid var(--d-line); padding-top:19px; margin-top:17px; }.discovery-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px 12px; }.discovery-fields label { display:flex; flex-direction:column; gap:8px; font-size:calc(11px * var(--ui-scale,1)); line-height:1.6; color:var(--d-muted); min-width:0; }.discovery-fields input,.discovery-fields select { display:block; width:100%; max-width:100%; min-width:0; height:44px; border:1px solid var(--d-line); background:var(--d-bg); border-radius:8px; padding:9px 10px; color:var(--d-ink); font-size:calc(12px * var(--ui-scale,1)); line-height:1.7; }.discovery-fields input:focus,.discovery-fields select:focus { outline:2px solid #b8a0d0; outline-offset:1px; }.discovery-fields input::placeholder { color:#b3a3be; }.discovery-field-note { color:var(--d-muted); font-size:calc(10px * var(--ui-scale,1)); line-height:1.8; margin:15px 0; }.discovery-form-error { color:#a14c73; font-size:calc(12px * var(--ui-scale,1)); line-height:1.7; margin:0 0 12px; }.discovery-apply { width:100%; }
.discovery-warnings { margin:13px 1px 22px; color:var(--d-muted); font-size:calc(10px * var(--ui-scale,1)); line-height:1.9; }.discovery-warnings p { margin:5px 0; }
.discovery-list-heading { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:23px 0 13px; font-size:calc(11px * var(--ui-scale,1)); color:var(--d-muted); line-height:1.7; }.discovery-list-heading strong { font-weight:500; color:var(--d-purple); }.discovery-list-heading button { display:flex; align-items:center; flex-wrap:wrap; justify-content:flex-end; gap:6px; border:0; background:transparent; color:var(--d-purple); padding:3px 0; font-size:calc(11px * var(--ui-scale,1)); line-height:1.7; }.discovery-list-heading button span { color:#b4a0c3; font-size:calc(9px * var(--ui-scale,1)); }
.discovery-result-grid { display:grid; gap:17px; }.discovery-trip { min-width:0; border:1px solid var(--d-line); border-radius:16px; background:var(--d-paper); overflow:hidden; }.discovery-trip-main { display:block; }.discovery-trip-image { position:relative; aspect-ratio:1.85; background:var(--d-soft); overflow:hidden; display:grid; place-items:center; }.discovery-trip-image::after { content:""; position:absolute; inset:40% 0 0; background:linear-gradient(transparent,#1c172e68); pointer-events:none; }.discovery-trip-image > img { width:100%; height:100%; object-fit:cover; display:block; position:absolute; inset:0; }.discovery-trip-image > .travel-icon { width:50px; height:50px; color:#b29bc5; stroke-width:1; }.discovery-trip-image > span { position:absolute; left:15px; bottom:13px; font-size:calc(11px * var(--ui-scale,1)); color:#fff; z-index:1; text-shadow:0 1px 4px #231a3355; }.discovery-trip-image .discovery-participation { top:13px; right:13px; left:auto; bottom:auto; color:#fff; background:#3c2456c7; padding:5px 9px; border-radius:6px; font-size:calc(10px * var(--ui-scale,1)); max-width:80%; }.discovery-trip-image .waitlist,.discovery-trip-image .verify,.discovery-trip-image .applied { background:#fffef0eb; color:#785479; text-shadow:none; }
.discovery-trip-body { padding:18px 17px 13px; }.discovery-trip-date { display:flex; gap:6px; align-items:flex-start; color:#9986a8; font-size:calc(11px * var(--ui-scale,1)); line-height:1.7; }.discovery-trip-date .travel-icon { width:14px; height:14px; margin-top:2px; }.discovery-trip h3 { margin:10px 0 10px; font-size:calc(19px * var(--ui-scale,1)); line-height:1.55; color:var(--d-ink); font-weight:550; }.discovery-trip-meta { display:flex; flex-wrap:wrap; gap:5px 10px; color:var(--d-muted); font-size:calc(10px * var(--ui-scale,1)); line-height:1.7; }.discovery-trip-meta span + span { position:relative; }.discovery-reasons { list-style:none; margin:14px 0 0; padding:0; color:#826b95; font-size:calc(11px * var(--ui-scale,1)); line-height:1.8; }.discovery-reasons li { display:flex; gap:6px; align-items:flex-start; margin:4px 0; }.discovery-reasons .travel-icon { width:13px; height:13px; margin-top:4px; }.discovery-caution { margin:12px 0 0; padding:9px 10px; border-radius:7px; background:var(--d-bg); color:#a18daf; font-size:calc(10px * var(--ui-scale,1)); line-height:1.7; }.discovery-trip-price { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; border-top:1px solid var(--d-line); padding-top:13px; margin-top:15px; }.discovery-trip-price > div { display:flex; align-items:baseline; flex-wrap:wrap; gap:6px; }.discovery-trip-price strong { font-size:calc(24px * var(--ui-scale,1)); font-weight:500; color:var(--d-purple); line-height:1.5; }.discovery-trip-price .discovery-unknown-price { font-size:calc(16px * var(--ui-scale,1)); }.discovery-trip-price small { font-size:calc(9px * var(--ui-scale,1)); color:#a893b7; }.discovery-trip-price > span { display:flex; align-items:center; gap:5px; color:var(--d-purple); font-size:calc(11px * var(--ui-scale,1)); flex:none; line-height:1.7; }.discovery-trip-price > span .travel-icon { width:15px; height:15px; }.discovery-price-note { font-size:calc(9px * var(--ui-scale,1)); margin:7px 0 0; line-height:1.8; color:#b3a3bf; }.discovery-trip-actions { border-top:1px solid var(--d-line); padding:11px 17px; display:flex; align-items:center; justify-content:space-between; gap:10px; }.discovery-trip-actions label { display:flex; align-items:center; gap:7px; font-size:calc(10px * var(--ui-scale,1)); color:var(--d-muted); line-height:1.7; cursor:pointer; }.discovery-trip-actions input { accent-color:var(--d-purple); width:15px; height:15px; margin:0; }.discovery-trip-actions a { color:var(--d-purple); font-size:calc(10px * var(--ui-scale,1)); line-height:1.7; }
.discovery-empty { text-align:center; padding:35px 18px; background:var(--d-paper); border:1px solid var(--d-line); border-radius:16px; margin-top:22px; }.discovery-empty-icon { display:grid; place-items:center; width:58px; height:58px; margin:auto; color:#ac92c0; background:var(--d-soft); border-radius:50%; }.discovery-empty-icon .travel-icon { width:29px; height:29px; stroke-width:1; }.discovery-empty h3 { font-size:calc(17px * var(--ui-scale,1)); line-height:1.7; font-weight:500; margin:20px 0 9px; }.discovery-empty p { font-size:calc(11px * var(--ui-scale,1)); color:var(--d-muted); line-height:1.8; }.discovery-empty-actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin:19px 0; }.discovery-empty-actions button { padding:8px 12px; border:1px solid var(--d-line); background:var(--d-paper); color:var(--d-purple); border-radius:99px; font-size:calc(10px * var(--ui-scale,1)); line-height:1.7; }.discovery-empty > a { color:var(--d-muted); display:inline-flex; align-items:center; gap:8px; font-size:calc(11px * var(--ui-scale,1)); }.discovery-empty > a .travel-icon { width:14px; height:14px; }
.discovery-more { display:flex; align-items:center; justify-content:center; width:100%; gap:10px; padding:15px; margin-top:19px; border:1px solid #d9c9e6; border-radius:99px; color:var(--d-purple) !important; background:var(--d-paper); font-size:calc(12px * var(--ui-scale,1)) !important; line-height:1.7; }
.discovery-comparison { padding:21px 17px; margin-top:30px; border:1px solid #d8c4e8; background:var(--d-paper); border-radius:17px; scroll-margin-top:18px; }.discovery-compare-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }.discovery-compare-heading h2 { font-size:calc(19px * var(--ui-scale,1)); font-weight:500; line-height:1.6; margin:9px 0 0; }.discovery-compare-heading > button { flex:none; width:28px; height:28px; padding:0; border:0; color:#9b85aa; background:transparent; font-size:27px; }.discovery-compare-note { color:var(--d-muted); font-size:calc(10px * var(--ui-scale,1)); line-height:1.8; }.discovery-compare-grid { display:grid; gap:16px; margin-top:22px; }.discovery-compare-grid article { min-width:0; background:var(--d-bg); border:1px solid var(--d-line); border-radius:12px; padding:17px 14px; }.discovery-compare-grid h3 { margin:0 0 17px; font-size:calc(16px * var(--ui-scale,1)); font-weight:500; line-height:1.6; color:var(--d-purple); }.discovery-compare-grid dl { margin:0; }.discovery-compare-grid dl > div { display:grid; grid-template-columns:76px minmax(0,1fr); gap:12px; padding:10px 0; border-top:1px solid var(--d-line); font-size:calc(11px * var(--ui-scale,1)); line-height:1.9; }.discovery-compare-grid dt { color:var(--d-muted); }.discovery-compare-grid dd { margin:0; color:var(--d-ink); white-space:pre-line; }.discovery-compare-grid article > a { display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--d-line); margin-top:10px; padding-top:15px; color:var(--d-purple); font-size:calc(12px * var(--ui-scale,1)); }
.discovery-spinner { width:14px; height:14px; border:1.5px solid #ffffff55; border-top-color:currentColor; border-radius:50%; animation:discovery-spin .85s linear infinite; flex:none; }@keyframes discovery-spin { to { transform:rotate(360deg); } }
:global(html[data-night="dark"] .discovery-page) { --d-purple:#d3b5ec; --d-ink:#eee6f5; --d-muted:#b1a0c0; --d-bg:#1c1625; --d-paper:#271e31; --d-soft:#3b2b4a; --d-line:#473451; }
:global(html[data-night="dark"] .discovery-page .discovery-primary) { color:#271e31 !important; }
:global(html[data-night="dark"] .discovery-page .discovery-conditions > span), :global(html[data-night="dark"] .discovery-page .discovery-reasons) { color:#c1a6d7; }
@media(min-width:700px) { .discovery-page { padding:45px 36px 70px; }.discovery-intro { padding-bottom:30px; }.discovery-intro h1 { font-size:calc(43px * var(--ui-scale,1)); }.discovery-intro h1 br { display:none; }.discovery-manual { position:absolute; bottom:37px; right:0; }.discovery-composer { padding:25px; }.discovery-composer textarea { min-height:90px; }.discovery-response { margin-top:45px; }.discovery-condition-card { padding:21px 24px; }.discovery-fields { grid-template-columns:repeat(3,minmax(0,1fr)); }.discovery-result-grid { grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; align-items:start; }.discovery-trip-body { padding:17px 15px 12px; }.discovery-trip h3 { font-size:calc(17px * var(--ui-scale,1)); }.discovery-trip-price { flex-wrap:wrap; }.discovery-trip-price > span { margin-left:auto; }.discovery-compare-grid { grid-template-columns:repeat(var(--compare-columns,3),minmax(0,1fr)); gap:14px; }.discovery-compare-grid dl > div { grid-template-columns:1fr; gap:4px; padding:10px 0; }.discovery-comparison { padding:27px 24px; }.discovery-compare-grid h3 { min-height:3.2em; }.discovery-result-heading h2 { font-size:calc(26px * var(--ui-scale,1)); } }
@media(max-width:360px) { .discovery-page { padding:23px 15px 40px; }.discovery-intro h1 { font-size:calc(32px * var(--ui-scale,1)); }.discovery-composer { padding:18px 15px 14px; }.discovery-primary { gap:7px; padding:11px 13px; }.discovery-fields { grid-template-columns:1fr; }.discovery-composer-foot { flex-wrap:wrap; }.discovery-condition-heading { align-items:flex-start; }.discovery-condition-heading h3 { max-width:55%; }.discovery-trip-price { flex-wrap:wrap; }.discovery-trip-actions { align-items:flex-start; }.discovery-mode { max-width:35%; }.discovery-compare-grid dl > div { grid-template-columns:65px minmax(0,1fr); gap:8px; } }
@media(prefers-reduced-motion:reduce) { .discovery-spinner { animation:none; } }
.discovery-page { --d-muted:#786782; }
.discovery-page .discovery-mode, .discovery-composer-foot > span, .discovery-trust, .discovery-trip-date, .discovery-caution, .discovery-trip-price small, .discovery-price-note, .discovery-list-heading button span { color:var(--d-muted); }
.discovery-page .discovery-mode, .discovery-page .discovery-eyebrow, .discovery-page .discovery-field-note, .discovery-page .discovery-trust, .discovery-page .discovery-price-note, .discovery-page .discovery-trip-price small, .discovery-page .discovery-compare-note { font-size:calc(11px * var(--ui-scale,1)); }
.discovery-examples button, .discovery-condition-heading button, .discovery-list-heading button, .discovery-trip-actions label, .discovery-trip-actions a { min-height:44px; }
.discovery-trip-actions a { display:inline-flex; align-items:center; }
.discovery-compare-heading > button { width:44px; height:44px; }
:global(html[data-night="dark"] .discovery-page) { --d-muted:#b1a0c0; }
</style>
