<template>
  <div class="home-page">
    <div
      class="brand-hero"
      :class="{ 'is-link': brandSlideTarget }"
      :role="brandSlideTarget ? 'link' : undefined"
      :tabindex="brandSlideTarget ? 0 : undefined"
      :aria-label="brandSlideTarget ? (brandSlide?.title || '打开线路详情') : undefined"
      @click="goSlide"
      @keydown.enter.prevent="goSlide"
      @keydown.space.prevent="goSlide"
    >
      <div
        v-if="brandSlide"
        class="swipe"
        role="img"
        :aria-label="brandSlide.title || '同行者众'"
        :style="slideBg(brandSlide)"
      >
        <img
          :key="mediaSrc(brandSlide.url)"
          :src="mediaSrc(brandSlide.url)"
          :alt="brandSlide.title || '同行者众'"
          @error="onSlideError($event, brandSlide)"
        />
      </div>
      <div class="brand-cap">
        <div class="home-kicker">{{ brandSlide?.title || home.brand?.lead || "在山野，遇见爱" }}</div>
      </div>
    </div>

    <div class="home-pad">
    <section class="campus-card">
      <div>
        <strong>学生认证后走学生价</strong>
        <p>部分团仅限高校，周末进山先看好集合点。</p>
      </div>
      <router-link
        v-if="store.profile?.studentStatus !== 'pending' && !store.profile?.isStudent && !store.profile?.isAlumni"
        class="campus-cta"
        to="/m/student"
      >去认证</router-link>
      <span v-else-if="store.profile?.isStudent || store.profile?.isAlumni" class="muted">已认证{{ store.profile.school ? " · " + store.profile.school : "" }}</span>
      <router-link v-else-if="store.profile?.studentStatus === 'pending'" class="campus-cta" to="/m/student">审核中</router-link>
    </section>

    <div v-if="upcoming" class="card trip-soon" @click="$router.push('/m/orders')">
      <div class="pad">
        <div class="muted">即将出行 · 看行程</div>
        <strong>{{ upcoming.title }}</strong>
        <p class="muted" style="margin:6px 0 0">{{ upcoming.startDate }} · {{ upcoming.meetupPoint }} {{ upcoming.meetupTime }}</p>
      </div>
    </div>

    <input class="feed-search" v-model="query" type="search" placeholder="搜线路、城区、主理人" />

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
        <button class="tool-btn play" type="button" @click="goPublish()">发团</button>
      </div>
    </div>

    <div v-if="fold.extra">
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

    <article class="feed-card" v-for="s in groups" :key="s.id" @click="$router.push('/m/schedule/' + s.id)">
      <div class="feed-cover">
        <img v-if="coverOf(s)" :src="coverOf(s)" :alt="s.route?.title || ''" />
        <div v-else class="feed-ph">{{ coverMark(s) }}</div>
        <div class="feed-boarded">{{ boardedLine(s) }}</div>
      </div>
      <div class="feed-body">
        <p class="feed-when">{{ feedWhen(s.startDate, s.meetupTime) }} · {{ s.city || s.route?.region }}</p>
        <h3 class="feed-title">{{ s.route?.title }}</h3>
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
    <div v-if="!groups.length" class="card publish-guide" @click="goPublish()">
      <div class="pad">
        <strong>还没有符合条件的团</strong>
        <p class="muted">发一个新团，审核通过后会出现在这里。</p>
        <button class="btn ghost block" type="button">去发团</button>
      </div>
    </div>

    <p class="home-foot muted">
      <router-link to="/m/official">客服与规则</router-link>
    </p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { OFFER_TYPES } from "@/utils/offer";
import { mediaSrc, slideBg, slideFallback, slideRouteTarget } from "@/utils/media";
import { boardedLine, coverMark, coverOf, feedWhen, hostName, isFreeOffer, taglineOf } from "@/utils/feedCard";
import { cycleSort, processFeed, sortLabel } from "@/utils/feedList";

const router = useRouter();
const store = useUserStore();
const schedules = ref([]);
const home = ref({ brand: {}, cities: [], tags: [], festivals: [], months: [] });
const city = ref("");
const date = ref("");
const tag = ref("");
const monthKey = ref("");
const monthPicked = ref(false);
const monthDays = ref([]);
const festivalKey = ref("");
const offerFilter = ref("");
const query = ref("");
const sort = ref("soon");
const heroIndex = ref(0);
const upcoming = ref(null);
const fold = reactive({ extra: false });
const offers = OFFER_TYPES.filter((o) => o.key !== "full");

const brandSlides = computed(() => {
  if (home.value.brand?.slides?.length) return home.value.brand.slides;
  return (home.value.brand?.gallery || []).map((url) => ({ url, title: "" }));
});
const brandSlide = computed(() => {
  const list = brandSlides.value;
  if (!list.length) return null;
  return list[heroIndex.value % list.length];
});
const brandSlideTarget = computed(() => slideRouteTarget(brandSlide.value));
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
  });
});
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
  if (query.value.trim()) rows.push({ key: "q", label: "搜 " + query.value.trim(), clear: () => { query.value = ""; } });
  if (sort.value !== "soon") rows.push({ key: "sort", label: sortLabel(sort.value), clear: () => { sort.value = "soon"; } });
  return rows;
});

let heroTimer;

onMounted(async () => {
  const [homeRes, schRes] = await Promise.all([
    http.get("/home").catch(() => ({ data: {} })),
    http.get("/schedules", { params: { channel: "trip" } }).catch(() => ({ data: [] })),
  ]);
  home.value = homeRes.data || {};
  monthKey.value = home.value.months?.[0]?.key || "";
  monthDays.value = home.value.monthDays || [];
  schedules.value = schRes.data || [];
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
function goSlide() {
  const path = brandSlideTarget.value;
  if (path) router.push(path);
}
function onSlideError(e, slide) {
  const fb = slideFallback(slide);
  if (!fb || e.target.dataset.fallback === "1") return;
  e.target.dataset.fallback = "1";
  e.target.src = fb;
  if (e.target.parentElement) e.target.parentElement.style.backgroundImage = `url("${fb}")`;
}
function goPublish(when) {
  const path = when ? `/m/publish?date=${when}` : "/m/publish";
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
