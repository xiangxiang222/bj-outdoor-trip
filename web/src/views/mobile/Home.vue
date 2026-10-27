<template>
  <div class="home-page">
    <div class="brand-hero">
      <div
        v-if="brandSlide"
        class="swipe"
        role="img"
        :aria-label="brandSlide.title || '同行者众'"
      >
        <img
          :key="mediaSrc(brandSlide.url)"
          :src="heroSource"
          :alt="brandSlide.title || '同行者众'"
          fetchpriority="high"
          decoding="async"
        @error="onHeroError"
        />
      </div>
      <div class="brand-cap">
        <span class="hero-eyebrow"><TravelIcon name="compass" /> 北京 · 周边山野</span>
        <h2>周末去山里见</h2>
        <p>趁着风正好，把一天还给山野。</p>
        <button class="hero-discover" type="button" @click="discoverTrips">看看本周出发 <TravelIcon name="arrow" /></button>
        <div class="hero-dots" aria-label="切换山野图片"><button v-for="(photo, i) in fallbackPhotos" :key="photo" type="button" :class="{ selected: heroIndex % fallbackPhotos.length === i }" :aria-label="'第 ' + (i + 1) + ' 张'" :aria-pressed="heroIndex % fallbackPhotos.length === i" @click="heroIndex = i"></button></div>
      </div>
      <div class="hero-photo-credit"><span>BEIYE · OUTDOOR</span><i></i><span>山野精选</span></div>
    </div>

    <div class="home-pad">
    <form class="discovery-search" @submit.prevent="discoverTrips">
      <div class="discovery-search-title"><span class="search-caption">给周末，一个好去处</span><span>从北京出发 <TravelIcon name="pin" /></span></div>
      <div class="discovery-search-fields">
        <label class="discovery-input"><TravelIcon name="search" /><input v-model="query" type="search" :placeholder="searchHint" aria-label="搜索线路、目的地或发起人" /></label>
        <label class="discovery-date"><TravelIcon name="calendar" /><input v-model="date" type="date" :min="today" aria-label="出发日期" /><span v-if="!date">出发日期不限</span></label>
        <button class="btn discovery-submit" type="submit">寻找我的山野 <TravelIcon name="arrow" /></button>
      </div>
      <div class="search-hot"><span>热门灵感</span><button v-for="word in ['长城', '古北水镇', '徒步', '草原']" :key="word" type="button" @click="searchDestination(word)">{{ word }}</button></div>
    </form>
    <div class="journey-shortcuts">
      <button type="button" @click="setView('routes')"><span><TravelIcon name="mountain" /></span><strong>精选线路</strong><small>去看更大的世界</small></button>
      <button type="button" @click="goPublish('', 'campus')"><span><TravelIcon name="school" /></span><strong>高校同行</strong><small>跨校 · 跨学院</small></button>
      <button type="button" @click="goPublish('', 'company')"><span><TravelIcon name="building" /></span><strong>公司团建</strong><small>团队一起出发</small></button>
      <button type="button" @click="$router.push('/m/guides')"><span><TravelIcon name="compass" /></span><strong>专业领队</strong><small>让旅途更安心</small></button>
    </div>
    <section class="destination-section" aria-label="山野出游灵感">
      <div class="section-heading"><div><span class="section-eyebrow">A LITTLE ESCAPE</span><h2>走出日常，自然会有答案</h2></div><span class="destination-caption">山野灵感</span></div>
      <div class="destination-grid">
        <button v-for="place in destinations" :key="place.keyword" class="destination-card" type="button" @click="searchDestination(place.keyword)"><img :src="place.photo" :alt="place.name" loading="lazy" /><span class="destination-shade"></span><span class="destination-tag">{{ place.tag }}</span><span class="destination-copy"><small>{{ place.en }}</small><strong>{{ place.name }}</strong><em>{{ place.copy }}</em></span><TravelIcon name="arrow" /></button>
      </div>
    </section>
    <section class="campus-card">
      <span class="campus-mark"><TravelIcon name="school" /></span>
      <div class="campus-copy">
        <strong>青春同行，不止同校</strong>
        <p>发现跨校与跨学院的旅程</p>
        <p>
          <span v-if="store.profile?.isStudent || store.profile?.isAlumni">已认证{{ store.profile.school ? " · " + store.profile.school : "" }}</span>
          <router-link v-else-if="store.profile?.studentStatus === 'pending'" to="/m/student">认证进度</router-link>
          <router-link v-else to="/m/student">校园认证</router-link>
        </p>
      </div>
      <button type="button" class="campus-cta" @click="discoverCampusTrips">看校园团 ›</button>
    </section>

    <button v-if="upcoming" class="trip-hint" type="button" @click="$router.push('/m/orders')">
      <span>
        <span class="muted">即将出行</span>
        <strong>{{ upcoming.startDate }} · {{ upcoming.title }}</strong>
      </span>
      <span class="muted">行程 ›</span>
    </button>

    <div ref="feedStart" class="home-seg" role="tablist" aria-label="选择出行方式">
      <button type="button" role="tab" :aria-selected="view === 'trips'" :class="{ on: view === 'trips' }" @click="setView('trips')">即将出发</button>
      <button type="button" role="tab" :aria-selected="view === 'routes'" :class="{ on: view === 'routes' }" @click="setView('routes')">精选线路</button>
    </div>

    <template v-if="view === 'trips'">
    <div class="chips city-bar">
      <div class="chip" :class="{ on: !city }" @click="city = ''">热门</div>
      <div class="chip" :class="{ on: city === c.name }" v-for="c in home.cities || []" :key="c.name" @click="toggleCity(c.name)">{{ c.name }}</div>
    </div>

    <div class="chips">
      <div class="chip" :class="{ on: !tag }" @click="tag = ''">全部玩法</div>
      <div class="chip" :class="{ on: tag === t.name }" v-for="t in home.tags || []" :key="t.id" @click="toggleTag(t.name)">{{ t.name }}</div>
    </div>

    <div class="feed-toolbar">
      <div class="hint">看看最近都在忙什么</div>
      <div class="tools">
        <button class="tool-btn" type="button" @click="sort = cycleSort(sort)">{{ sortLabel(sort) }}</button>
        <button class="tool-btn" type="button" @click="fold.extra = !fold.extra">{{ fold.extra ? "收起" : "筛选" }}</button>
      </div>
    </div>

    <div v-if="fold.extra">
      <div class="chips">
        <div class="chip" :class="{ on: !hostKind }" @click="clearHost()">全部团</div>
        <div class="chip" :class="{ on: hostKind === 'official' }" @click="toggleHost('official')">官方</div>
        <div class="chip" :class="{ on: hostKind === 'company' }" @click="toggleHost('company')">公司</div>
        <div class="chip" :class="{ on: hostKind === 'campus' }" @click="toggleHost('campus')">高校</div>
        <div class="chip" :class="{ on: hostKind === 'individual' }" @click="toggleHost('individual')">个人</div>
      </div>
      <div class="chips" v-if="hostKind === 'company' && hostFacets.companies.length">
        <div class="chip" :class="{ on: !companyName }" @click="companyName = ''">全部公司</div>
        <div class="chip" :class="{ on: companyName === n }" v-for="n in hostFacets.companies" :key="n" @click="toggleCompany(n)">{{ n }}</div>
      </div>
      <div class="chips" v-if="hostKind === 'campus' && hostFacets.schools.length">
        <div class="chip" :class="{ on: !school }" @click="school = ''">全部高校</div>
        <div class="chip" :class="{ on: school === n }" v-for="n in hostFacets.schools" :key="n" @click="toggleSchool(n)">{{ n }}</div>
      </div>
      <div class="cal">
        <div class="cal-day" :class="{ on: date === d.date }" v-for="d in calendar" :key="d.date" @click="toggleDate(d.date)">
          <span class="muted">{{ d.w }}</span>
          <span class="n">{{ d.n }}</span>
          <span class="muted">{{ d.count ? d.count + "团" : "—" }}</span>
        </div>
      </div>
      <div class="chips">
        <div class="chip" :class="{ on: monthKey === m.key && monthPicked }" v-for="m in home.months || []" :key="m.key" @click="pickMonth(m.key)">{{ m.label }}</div>
      </div>
      <div class="month-grid" v-if="monthPicked && monthDays.length">
        <button class="month-cell" type="button" :class="{ on: date === d.date }" v-for="d in monthDays" :key="d.date" @click="toggleDate(d.date)">
          {{ d.label }}
          <small>{{ d.hasTrip ? d.count + "团" : "" }}</small>
        </button>
      </div>
      <div class="chips">
        <div class="chip" :class="{ on: festivalKey === f.key }" v-for="f in home.festivals || []" :key="f.key" @click="festivalKey = festivalKey === f.key ? '' : f.key">{{ f.name }}</div>
      </div>
      <div class="chips" v-if="activeFestival">
        <div class="chip" :class="{ on: date === d.date }" v-for="d in activeFestival.dates" :key="d.date" @click="toggleDate(d.date)">{{ d.label }}</div>
      </div>
      <div class="chips">
        <div class="offer-chip" v-for="o in offers" :key="o.key" :style="{ background: o.color, opacity: offerFilter && offerFilter !== o.key ? 0.45 : 1 }" @click="offerFilter = offerFilter === o.key ? '' : o.key">{{ o.label }}</div>
      </div>
    </div>

    <div class="picked" v-if="picked.length">
      <span class="picked-chip" v-for="p in picked" :key="p.key">
        {{ p.label }}
        <button type="button" aria-label="去掉" @click="p.clear()">×</button>
      </span>
    </div>

    <article class="feed-card" v-for="s in visibleGroups" :key="s.id" @click="$router.push('/m/schedule/' + s.id)">
      <div class="feed-cover">
        <img v-if="coverOf(s)" :src="coverOf(s)" :alt="s.route?.title || ''" loading="lazy" decoding="async" />
        <div v-else class="feed-ph">{{ coverMark(s) }}</div>
        <div class="feed-boarded">{{ boardedLine(s) }}</div>
      </div>
      <div class="feed-body">
        <p class="feed-when">{{ feedWhen(s.startDate, s.meetupTime) }} · {{ s.city || s.route?.region }}</p>
        <h3 class="feed-title"><TripKind :kind="s.kind" :type="s.organizerType" :channel="s.channel" /> <span v-if="s.private" class="offer-chip inline" style="background:#4c1d95">口令团</span> {{ s.route?.title }}</h3>
        <p class="feed-host">{{ hostName(s) }}<template v-if="s.meetupPoint"> · {{ s.meetupPoint }}</template></p>
        <p class="feed-tagline" v-if="taglineOf(s)">{{ taglineOf(s) }}</p>
        <p class="feed-price">
          <template v-if="isFreeOffer(s)">免费</template>
          <template v-else>
            <b>¥{{ s.quote?.originPrice }}</b>
            <span>会员 ¥{{ s.quote?.memberPrice }}</span>
          </template>
        </p>
      </div>
    </article>
    <button v-if="groups.length > visibleGroups.length" class="feed-load-more" type="button" @click="visibleFeedCount += 8">
      继续发现 <span>{{ visibleGroups.length }} / {{ groups.length }}</span>
    </button>
    <div v-if="loading && !groups.length" class="card"><div class="pad load-row"><span class="spinner"></span><span class="muted">正在加载近期的团…</span></div></div>
    <div v-else-if="!groups.length" class="card">
      <div class="pad">
        <strong>还没有符合条件的团</strong>
        <p class="muted">过审的团会出现在这里。也可以先看官方线路。</p>
        <div class="catalog-row" style="margin:10px 0 0">
          <button class="tool-btn ghost-line" type="button" @click="setView('routes')">先看线路</button>
          <button class="tool-btn play" type="button" @click="goPublish()">去发团</button>
        </div>
      </div>
    </div>
    </template>

    <RouteCatalog v-else :q="query" :seed-tag="tag" />

    <section class="organizer-section">
      <div class="section-heading">
        <div><span class="section-eyebrow">GATHER YOUR PEOPLE</span><h2>一起出发，也可以一起发团</h2></div>
        <TravelIcon name="mountain" />
      </div>
      <div class="organizer-grid">
        <button type="button" class="organizer-link campus" @click="goPublish('', 'campus')"><span class="organizer-icon"><TravelIcon name="school" /></span><span><strong>高校发团</strong><small>跨学校 · 跨学院招募</small></span><TravelIcon name="chevron" /></button>
        <button type="button" class="organizer-link company" @click="goPublish('', 'company')"><span class="organizer-icon"><TravelIcon name="building" /></span><span><strong>公司团建</strong><small>让团队在山野相聚</small></span><TravelIcon name="chevron" /></button>
      </div>
    </section>
    <button class="publish-entry" type="button" @click="goPublish()">
      <span class="publish-entry-copy">
        <strong>发个团去玩吧</strong>
        <span>选条线路，过审就能喊人上车</span>
      </span>
      <span class="publish-entry-go">创建行程 <TravelIcon name="arrow" /></span>
    </button>


    <p class="home-foot muted">
      <router-link to="/m/official">客服与规则</router-link>
    </p>
    </div>

  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { OFFER_TYPES } from "@/utils/offer";
import { mediaSrc } from "@/utils/media";
import { boardedLine, coverMark, coverOf, feedWhen, hostName, isFreeOffer, taglineOf } from "@/utils/feedCard";
import { cycleSort, hostFacets as collectHostFacets, processFeed, sortLabel } from "@/utils/feedList";
import RouteCatalog from "@/components/RouteCatalog.vue";
import TripKind from "@/components/TripKind.vue";
import TravelIcon from "@/components/TravelIcon.vue";

const pageRoute = useRoute();
const router = useRouter();
const store = useUserStore();
const schedules = ref([]);
const feedStart = ref(null);
const today = new Date().toLocaleDateString('en-CA');
const destinations = [
  { keyword: '长城', name: '在长城，追一场山风', en: 'WALK INTO THE WILD', tag: '山脊漫步', copy: '把辽阔，装进周末', photo: '/static/photos/mutianyu.jpg' },
  { keyword: '山', name: '山深处，有好风景', en: 'FIND YOUR OWN PACE', tag: '山野徒步', copy: '慢下来，听山野说话', photo: '/static/photos/wuling_07.jpg' },
  { keyword: '海', name: '去海边，等风也等你', en: 'MEET BY THE SEA', tag: '海岸出走', copy: '有些放松，只需一片海', photo: '/static/photos/beidaihe.jpg' },
];
const home = ref({ brand: {}, cities: [], tags: [], festivals: [], months: [] });
const loading = ref(true);
const city = ref("");
const date = ref("");
const tag = ref("");
const visibleFeedCount = ref(8);
const monthKey = ref("");
const monthPicked = ref(false);
const monthDays = ref([]);
const festivalKey = ref("");
const offerFilter = ref("");
const hostKind = ref("");
const companyName = ref("");
const school = ref("");
const query = ref("");
const sort = ref("soon");
const heroIndex = ref(0);
const upcoming = ref(null);
const fold = reactive({ extra: false });
const offers = OFFER_TYPES.filter((o) => o.key !== "full");
const view = ref(pageRoute.query.view === "routes" ? "routes" : "trips");
const searchHint = computed(() => (view.value === "routes" ? "搜长城 / 十渡 / 坝上" : "搜线路、城区、主理人"));

const brandSlides = computed(() => {
  if (home.value.brand?.slides?.length) return home.value.brand.slides;
  return (home.value.brand?.gallery || []).map((url) => ({ url, title: "" }));
});
const brandSlide = computed(() => {
  const list = brandSlides.value;
  if (!list.length) return null;
  return list[heroIndex.value % list.length];
});
const fallbackPhotos = ["/static/photos/mutianyu_06.jpg", "/static/photos/wuling_07.jpg", "/static/photos/beidaihe.jpg"];
const heroSource = computed(() => mediaSrc(brandSlide.value?.url) || fallbackPhotos[heroIndex.value % fallbackPhotos.length]);
const activeFestival = computed(() => (home.value.festivals || []).find((f) => f.key === festivalKey.value));
const calendar = computed(() => {
  const days = [];
  const now = new Date();
  const weeks = ["日", "一", "二", "三", "四", "五", "六"];
  for (let i = 0; i < 15; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({
      date: key,
      n: d.getDate(),
      w: i === 0 ? "今" : "周" + weeks[d.getDay()],
      count: countOn(key),
    });
  }
  return days;
});
const groups = computed(() => {
  const festDates = new Set((activeFestival.value?.dates || []).map((d) => d.date));
  return processFeed(schedules.value, {
    query: query.value,
    sort: sort.value,
    city: city.value,
    tag: tag.value,
    date: date.value,
    festivalDates: festivalKey.value ? festDates : null,
    offerFilter: offerFilter.value,
    monthKey: monthKey.value,
    monthPicked: monthPicked.value,
    channel: "trip",
    hostKind: hostKind.value,
    companyName: companyName.value,
    school: school.value,
  });
});
const visibleGroups = computed(() => groups.value.slice(0, visibleFeedCount.value));
watch(groups, () => { visibleFeedCount.value = 8; });
const hostFacets = computed(() => collectHostFacets(schedules.value));
const picked = computed(() => {
  const rows = [];
  if (city.value) rows.push({ key: "city", label: city.value, clear: () => { city.value = ""; } });
  if (date.value) rows.push({ key: "date", label: date.value.slice(5), clear: () => { date.value = ""; } });
  if (monthPicked.value && !date.value && monthKey.value) rows.push({ key: "month", label: monthKey.value.slice(5) + "月", clear: () => { monthPicked.value = false; } });
  if (festivalKey.value && activeFestival.value) rows.push({ key: "fest", label: activeFestival.value.name, clear: () => { festivalKey.value = ""; } });
  if (tag.value) rows.push({ key: "tag", label: tag.value, clear: () => { tag.value = ""; } });
  if (offerFilter.value) {
    const o = offers.find((x) => x.key === offerFilter.value);
    if (o) rows.push({ key: "offer", label: o.label, clear: () => { offerFilter.value = ""; } });
  }
  if (hostKind.value === "official") rows.push({ key: "host", label: "官方团", clear: () => clearHost() });
  if (hostKind.value === "company") rows.push({ key: "host", label: "公司团", clear: () => clearHost() });
  if (hostKind.value === "campus") rows.push({ key: "host", label: "高校团", clear: () => clearHost() });
  if (hostKind.value === "individual") rows.push({ key: "host", label: "个人拼团", clear: () => clearHost() });
  if (companyName.value) rows.push({ key: "company", label: companyName.value, clear: () => { companyName.value = ""; } });
  if (school.value) rows.push({ key: "school", label: school.value, clear: () => { school.value = ""; } });
  if (query.value.trim()) rows.push({ key: "q", label: "搜 " + query.value.trim(), clear: () => { query.value = ""; } });
  if (sort.value !== "soon") rows.push({ key: "sort", label: sortLabel(sort.value), clear: () => { sort.value = "soon"; } });
  return rows;
});

let heroTimer;

onMounted(async () => {
  try {
    const cached = JSON.parse(sessionStorage.getItem("bj_home_cache") || "null");
    if (cached && cached.home) {
      home.value = cached.home;
      schedules.value = cached.schedules || [];
      loading.value = false;
    }
  } catch {
    /* ignore stale cache */
  }
  const [homeRes, schRes] = await Promise.all([
    http.get("/home").catch(() => ({ data: {} })),
    http.get("/schedules", { params: { channel: "trip" } }).catch(() => ({ data: [] })),
  ]);
  home.value = homeRes.data || {};
  monthKey.value = home.value.months?.[0]?.key || "";
  monthDays.value = home.value.monthDays || [];
  schedules.value = schRes.data || [];
  loading.value = false;
  try {
    sessionStorage.setItem("bj_home_cache", JSON.stringify({ home: home.value, schedules: schedules.value }));
  } catch {
    /* storage full */
  }
  if (store.token) {
    store.fetchMe().catch(() => {});
    try {
      const trips = (await http.get("/me/trips")).data || [];
      upcoming.value = trips[0] || null;
    } catch {
      upcoming.value = null;
    }
  }
  heroTimer = setInterval(() => {
    const n = brandSlides.value.length;
    if (n) heroIndex.value = (heroIndex.value + 1) % n;
  }, 4000);
});
onUnmounted(() => clearInterval(heroTimer));

watch(
  () => pageRoute.query.view,
  (next) => {
    view.value = next === "routes" ? "routes" : "trips";
  }
);

function setView(next) {
  view.value = next;
  const queryMap = { ...pageRoute.query };
  if (next === "routes") queryMap.view = "routes";
  else delete queryMap.view;
  router.replace({ path: "/m", query: queryMap });
}
function countOn(day) {
  return schedules.value.filter((s) => s.startDate === day && s.status !== "cancelled").length;
}
function toggleCity(name) {
  city.value = city.value === name ? "" : name;
}
function toggleDate(d) {
  date.value = date.value === d ? "" : d;
}
function toggleTag(name) {
  tag.value = tag.value === name ? "" : name;
}
function clearHost() {
  hostKind.value = "";
  companyName.value = "";
  school.value = "";
}
function toggleHost(kind) {
  if (hostKind.value === kind) {
    clearHost();
    return;
  }
  hostKind.value = kind;
  if (kind !== "company") companyName.value = "";
  if (kind !== "campus") school.value = "";
}
function toggleCompany(name) {
  companyName.value = companyName.value === name ? "" : name;
}
function toggleSchool(name) {
  school.value = school.value === name ? "" : name;
}
function discoverTrips() {
  feedStart.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function discoverCampusTrips() {
  query.value = "";
  city.value = "";
  date.value = "";
  tag.value = "";
  offerFilter.value = "";
  festivalKey.value = "";
  monthPicked.value = false;
  companyName.value = "";
  school.value = "";
  hostKind.value = "campus";
  fold.extra = true;
  setView("trips");
  await nextTick();
  discoverTrips();
}
function searchDestination(keyword) {
  query.value = keyword;
  setView('routes');
  discoverTrips();
}
function onHeroError(e) {
  if (e.target.dataset.fallback === "1") return;
  e.target.dataset.fallback = "1";
  e.target.src = "/static/photos/wulingPeak.jpg";
  if (e.target.parentElement) e.target.parentElement.style.backgroundImage = 'url("/static/photos/wulingPeak.jpg")';
}
function goPublish(when, organizer) {
  const params = new URLSearchParams();
  if (when) params.set("date", when);
  if (organizer) params.set("type", organizer);
  const queryString = params.toString();
  const path = "/m/publish" + (queryString ? `?${queryString}` : "");
  if (!store.token) {
    router.push({ path: "/m/login", query: { redirect: path } });
    return;
  }
  router.push(path);
}
async function pickMonth(key) {
  monthKey.value = key;
  monthPicked.value = true;
  fold.extra = true;
  const res = await http.get("/home", { params: { month: key } });
  monthDays.value = res.data?.monthDays || [];
}
</script>
