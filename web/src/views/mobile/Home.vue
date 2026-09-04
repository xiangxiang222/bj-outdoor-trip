<template>
  <div>
    <div class="brand-hero">
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
        <div class="home-kicker">{{ brandSlide?.kicker || home.brand?.kicker || "同行者众" }}</div>
        <div class="home-lead">{{ brandSlide?.title || home.brand?.lead || "在山野，遇见爱" }}</div>
      </div>
    </div>

    <div class="filter-block">
      <div class="h2">去哪儿玩？</div>
      <div class="chips city-bar">
        <div class="chip" :class="{ on: city === c.name }" v-for="c in home.cities || []" :key="c.name" @click="toggleCity(c.name)">{{ c.name }}</div>
      </div>
    </div>

    <div class="filter-block">
      <div class="h2">哪天玩？</div>
      <button class="fold-head" type="button" @click="fold.days = !fold.days">最近十五天 <span>{{ fold.days ? "收起" : "展开" }}</span></button>
      <div class="cal" v-if="fold.days">
        <div class="cal-day" :class="{ on: date === d.date }" v-for="d in calendar" :key="d.date" @click="toggleDate(d.date)">
          <span class="n">{{ d.label }}</span>
          <span class="muted">{{ d.count ? d.count + " 团" : "—" }}</span>
        </div>
      </div>
      <button class="fold-head" type="button" @click="fold.month = !fold.month">按月选择 <span>{{ fold.month ? "收起" : "展开" }}</span></button>
      <div v-if="fold.month">
        <div class="chips">
          <div class="chip" :class="{ on: monthKey === m.key }" v-for="m in home.months || []" :key="m.key" @click="pickMonth(m.key)">{{ m.label }}</div>
        </div>
        <div class="month-grid" v-if="monthDays.length">
          <button class="month-cell" type="button" :class="{ on: date === d.date }" v-for="d in monthDays" :key="d.date" @click="toggleDate(d.date)">
            {{ d.label }}
            <small>{{ d.hasTrip ? d.count + "团" : "" }}</small>
          </button>
        </div>
      </div>
      <button class="fold-head" type="button" @click="fold.fest = !fold.fest">按节日 <span>{{ fold.fest ? "收起" : "展开" }}</span></button>
      <div v-if="fold.fest">
        <div class="chips">
          <div class="chip" :class="{ on: festivalKey === f.key }" v-for="f in home.festivals || []" :key="f.key" @click="festivalKey = festivalKey === f.key ? '' : f.key">{{ f.name }}</div>
        </div>
        <div class="chips" v-if="activeFestival">
          <div class="chip" :class="{ on: date === d.date }" v-for="d in activeFestival.dates" :key="d.date" @click="toggleDate(d.date)">{{ d.label }}</div>
        </div>
      </div>
    </div>

    <div class="filter-block">
      <div class="h2">想怎么玩？</div>
      <div class="chips">
        <div class="chip" :class="{ on: tag === t.name }" v-for="t in home.tags || []" :key="t.id" :style="tag === t.name ? { background: t.color, color: '#fff', borderColor: t.color } : {}" @click="toggleTag(t.name)">{{ t.name }}</div>
      </div>
    </div>

    <div class="picked" v-if="picked.length">
      <span class="picked-chip" v-for="p in picked" :key="p.key">
        {{ p.label }}
        <button type="button" aria-label="去掉" @click="p.clear()">×</button>
      </span>
    </div>

    <div class="chips">
      <div class="offer-chip" v-for="o in offers" :key="o.key" :style="{ background: o.color, opacity: offerFilter && offerFilter !== o.key ? 0.45 : 1 }" @click="offerFilter = offerFilter === o.key ? '' : o.key">{{ o.label }}</div>
      <div class="offer-chip publish" @click="goPublish()">发团</div>
    </div>

    <div class="trip-card" v-for="s in groups" :key="s.id" @click="$router.push('/m/schedule/' + s.id)">
      <div class="trip-swipe" v-if="cardGallery(s).length">
        <img :src="cardGallery(s)[cardIdx(s) % cardGallery(s).length]" :alt="s.route?.title" />
      </div>
      <div class="pad">
        <div class="row">
          <strong>{{ s.route?.title }}</strong>
          <span class="tag">{{ s.startDate }}</span>
        </div>
        <p class="muted" style="margin:6px 0">{{ s.city || s.route?.region }} · {{ s.organizerType === "company" ? s.companyName : s.organizerName }} · 余 {{ s.remain }} 座</p>
        <TripPrices :quote="s.quote" compact />
      </div>
    </div>
    <div v-if="!groups.length" class="card publish-guide" @click="goPublish()">
      <div class="pad">
        <strong>还没有符合条件的团</strong>
        <p class="muted">发一个新团，审核通过后会出现在这里。</p>
        <button class="btn ghost block" type="button">去发团</button>
      </div>
    </div>

    <div class="cta-list">
      <router-link class="cta-row" to="/m/mine">推荐报名 · 把好团推给朋友，按人数结 5%</router-link>
      <router-link class="cta-row" to="/m/guides">推荐领队 · 首次带队完成后奖励 200 元</router-link>
      <a v-if="!store.profile?.isMember" class="cta-row" @click.prevent="goMember">会员注册 · 年费 99，线路 95 折</a>
      <router-link v-if="!store.profile?.isStudent && store.profile?.studentStatus !== 'pending'" class="cta-row" to="/m/student">学生注册 · 认证后享学生价</router-link>
      <router-link v-if="store.profile?.studentStatus === 'pending'" class="cta-row muted" to="/m/student">学生认证审核中</router-link>
      <router-link v-if="store.profile?.groupStatus !== 'approved' && store.profile?.groupStatus !== 'pending'" class="cta-row" to="/m/group">团体注册 · 学生会 / 跑团 / 品牌</router-link>
      <router-link v-if="store.profile?.groupStatus === 'pending'" class="cta-row muted" to="/m/group">团体认证审核中</router-link>
      <router-link class="cta-row" to="/m/lottery">抽奖 · 报名前可抽一次，出行后再抽</router-link>
      <router-link class="cta-row" to="/m/official">联系我们</router-link>
      <router-link class="cta-row" to="/m/feedback">功能建议与找 BUG</router-link>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { OFFER_TYPES } from "@/utils/offer";
import { mediaSrc, slideBg, slideFallback } from "@/utils/media";
import TripPrices from "@/components/TripPrices.vue";

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
const heroIndex = ref(0);
const tick = ref(0);
const fold = reactive({ days: true, month: false, fest: false });
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
const activeFestival = computed(() => (home.value.festivals || []).find((f) => f.key === festivalKey.value));
const calendar = computed(() => {
  const days = [];
  const now = new Date();
  for (let i = 0; i < 15; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ date: key, label: `${d.getMonth() + 1}/${d.getDate()}`, count: countOn(key) });
  }
  return days;
});
const groups = computed(() => {
  const festDates = new Set((activeFestival.value?.dates || []).map((d) => d.date));
  return schedules.value
    .filter((s) => s.status !== "cancelled" && Number(s.remain) > 0)
    .filter((s) => (s.channel || "trip") !== "activity")
    .filter((s) => !city.value || s.city === city.value)
    .filter((s) => !date.value || s.startDate === date.value)
    .filter((s) => !festivalKey.value || !festDates.size || festDates.has(s.startDate))
    .filter((s) => !tag.value || (s.playTags || []).some((t) => t.name === tag.value))
    .filter((s) => !offerFilter.value || s.offerType === offerFilter.value)
    .filter((s) => !monthPicked.value || date.value || String(s.startDate || "").startsWith(monthKey.value));
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
  if (store.token) store.fetchMe().catch(() => {});
  heroTimer = setInterval(() => {
    const n = brandSlides.value.length;
    if (n) heroIndex.value = (heroIndex.value + 1) % n;
    tick.value += 1;
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
  fold.month = true;
  const res = await http.get("/home", { params: { month: key } });
  monthDays.value = res.data?.monthDays || [];
}
function goMember() {
  if (!store.token) {
    router.push({ path: "/m/login", query: { redirect: "/m/member" } });
    return;
  }
  router.push("/m/member");
}
function cardGallery(s) {
  const g = s.gallery || s.route?.gallery || [];
  if (g.length) return g;
  return s.route?.cover ? [s.route.cover] : [];
}
function cardIdx(s) {
  const n = cardGallery(s).length || 1;
  return tick.value % n;
}
</script>
