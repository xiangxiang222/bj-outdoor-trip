<template>
  <div>
    <div class="brand-hero" @click="goSlide(brandSlide)">
      <div class="swipe" v-if="brandSlide">
        <img :src="brandSlide.url" :alt="brandSlide.title || '北野行'" />
      </div>
      <div class="brand-cap">
        <div class="home-kicker">{{ home.brand?.kicker || "北野行" }}</div>
        <div class="home-lead">{{ brandSlide?.title || home.brand?.lead || "说走就走的京郊山野" }}</div>
      </div>
    </div>

    <div class="chips city-bar">
      <div
        class="chip"
        :class="{ on: city === c.name }"
        v-for="c in home.cities || []"
        :key="c.name"
        @click="pickCity(c.name)"
      >{{ c.name }}</div>
    </div>
    <div class="swipe city-swipe" v-if="citySlide" @click="goSlide(citySlide)">
      <img :src="citySlide.url" :alt="citySlide.title || city" />
      <div class="city-swipe-cap">{{ citySlide.title || city }}</div>
    </div>

    <div v-if="upcoming.length" class="card" @click="$router.push('/m/schedule/' + upcoming[0].scheduleId)">
      <div class="pad">
        <div class="muted">即将出行</div>
        <div class="row">
          <strong>{{ upcoming[0].title }}</strong>
          <span class="tag">{{ upcoming[0].startDate }}</span>
        </div>
        <p class="muted" style="margin:6px 0 0">集合 {{ upcoming[0].meetupPoint }} {{ upcoming[0].meetupTime }}<template v-if="upcoming[0].seatNo"> · {{ upcoming[0].seatNo }}座</template></p>
      </div>
    </div>

    <div class="h2">出发日历</div>
    <div class="muted" style="margin:-4px 0 8px">最近十五日，没团可点发团</div>
    <div class="cal">
      <div class="cal-day" :class="{ on: d.count }" v-for="d in calendar" :key="d.date" @click="goDay(d)">
        <span class="n">{{ d.label }}</span>
        <span class="muted">{{ d.count ? d.count + " 团" : "发团" }}</span>
      </div>
    </div>

    <div class="h2">按月</div>
    <div class="chips">
      <div class="chip" :class="{ on: monthKey === m.key }" v-for="m in home.months || []" :key="m.key" @click="pickMonth(m.key)">{{ m.label }}</div>
    </div>
    <div class="month-grid" v-if="monthDays.length">
      <button class="month-cell" type="button" :class="{ on: d.hasTrip, muted: !d.hasTrip }" v-for="d in monthDays" :key="d.date" @click="goDay(d)">
        {{ d.label }}
        <small>{{ d.hasTrip ? d.count + "团" : "发团" }}</small>
      </button>
    </div>

    <div class="h2">按节日</div>
    <div class="chips">
      <div class="chip" :class="{ on: festivalKey === f.key }" v-for="f in home.festivals || []" :key="f.key" @click="festivalKey = festivalKey === f.key ? '' : f.key">{{ f.name }}</div>
    </div>
    <div class="chips" v-if="activeFestival">
      <div class="chip" v-for="d in activeFestival.dates" :key="d.date" @click="goDay({ date: d.date, count: countOn(d.date) })">{{ d.label }} · {{ countOn(d.date) ? countOn(d.date) + "团" : "发团" }}</div>
    </div>

    <div class="home-grid">
      <button class="home-tile" type="button" v-for="d in home.durations || []" :key="d.key" @click="goRoutes({ days: d.days })">
        <strong>{{ d.label }}</strong>
        <span>{{ d.hint }}</span>
        <div class="tile-thumbs" v-if="d.thumbs?.length">
          <img v-for="t in d.thumbs.slice(0, 3)" :key="t.scheduleId" :src="t.cover" :alt="t.title" @click.stop="$router.push('/m/schedule/' + t.scheduleId)" />
        </div>
      </button>
    </div>

    <div class="h2">想怎么玩</div>
    <div class="chips">
      <div class="play-tag" v-for="t in home.tags || []" :key="t.id" :style="{ background: t.color }" @click="goRoutes({ tag: t.name })">
        <img v-if="t.cover" :src="t.cover" :alt="t.name" />
        {{ t.name }}
      </div>
    </div>

    <div class="banner" v-if="theme" @click="$router.push('/m/route/' + theme.id)">
      <img :src="theme.cover" :alt="theme.title" />
      <div class="cap">
        <div style="font-size:12px;opacity:.9">本周推荐 · {{ theme.days }}日 · {{ theme.region }}</div>
        <div style="font-size:18px;font-weight:700">{{ theme.title }}</div>
        <div class="tag-row">
          <span class="play-tag sm" v-for="t in theme.playTags || []" :key="t.id || t" :style="{ background: t.color || '#2d6a4f' }">{{ t.name || t }}</span>
        </div>
      </div>
    </div>

    <div class="row" style="margin:16px 0 8px">
      <div class="h2" style="margin:0">开团招募</div>
      <router-link to="/m/chain" class="muted">全部拼团</router-link>
    </div>
    <div class="chips">
      <div class="offer-chip" v-for="o in offers" :key="o.key" :style="{ background: o.color }" @click="offerFilter = offerFilter === o.key ? '' : o.key">{{ o.label }}</div>
      <div class="offer-chip publish" @click="goPublish()">发团</div>
    </div>
    <div class="card" v-for="s in groups" :key="s.id" @click="$router.push('/m/schedule/' + s.id)">
      <div class="pad">
        <div class="row">
          <strong>
            <span class="offer-chip inline" :style="{ background: s.offerColor }">{{ s.offerLabel }}</span>
            {{ s.route?.title }}
          </strong>
          <span class="tag">{{ s.startDate }}</span>
        </div>
        <div class="tag-row">
          <span class="play-tag sm" v-for="t in s.playTags || []" :key="t.id" :style="{ background: t.color }">
            <img v-if="t.cover" :src="t.cover" :alt="t.name" />{{ t.name }}
          </span>
        </div>
        <div class="muted" style="margin:6px 0">{{ s.organizerType === "company" ? s.companyName : s.organizerName }} · 余 {{ s.remain }} 座<template v-if="s.guaranteed"> · 铁定出发</template></div>
        <p v-if="s.guide" class="guide-hit" @click.stop="$router.push('/m/guide/' + s.guide.id)">导游 {{ s.guide.name }} · 查看详情</p>
        <p v-else class="muted guide-hit" @click.stop="$router.push('/m/guides')">成团后匹配导游 · 先看看领队</p>
        <div class="progress"><i :style="{ width: Math.min(100, ((s.enrolled || 0) / (s.maxSeats || 1)) * 100) + '%' }"></i></div>
        <div class="row" style="margin-top:8px">
          <span class="muted">{{ s.enrolled }}/{{ s.maxSeats }} · 成团 {{ s.minGroupSize }}</span>
          <span class="price-pair">
            <s v-if="s.quote?.originPrice > s.quote?.price" class="price-origin">¥{{ s.quote.originPrice }}</s>
            <span class="price">¥{{ s.quote?.price }}</span>
          </span>
        </div>
      </div>
    </div>
    <div v-if="!groups.length" class="card"><div class="pad">
      <p class="muted" style="margin:0 0 10px">暂时没有招募中的团，可以发一个新团，审核通过后会出现在这里。</p>
      <button class="btn ghost block" type="button" @click="goPublish()">去发团</button>
    </div></div>

    <div class="row" style="margin:16px 0 8px">
      <div class="h2" style="margin:0">周末短途</div>
      <router-link to="/m/routes?days=1" class="muted">1 日线路</router-link>
    </div>
    <div class="card" v-for="r in weekend" :key="r.id" @click="$router.push('/m/route/' + r.id)">
      <img class="cover" :src="r.cover" :alt="r.title" style="height:120px" />
      <div class="pad">
        <div class="row">
          <strong>{{ r.title }}</strong>
          <span class="tag">{{ r.region }}</span>
        </div>
        <div class="tag-row">
          <span class="play-tag sm" v-for="t in r.playTags || r.tags || []" :key="t.id || t" :style="{ background: t.color || '#2d6a4f' }">{{ t.name || t }}</span>
        </div>
        <div class="price-pair" style="margin-top:6px">
          <s v-if="r.fromPrice && r.memberFromPrice && r.fromPrice > r.memberFromPrice" class="price-origin">¥{{ r.fromPrice }}</s>
          <span class="price">¥{{ r.memberFromPrice || r.fromPrice }} <small>起</small></span>
        </div>
      </div>
    </div>

    <div class="row" style="margin:16px 0 8px">
      <div class="h2" style="margin:0">领队导游</div>
      <router-link to="/m/guides" class="muted">全部导游</router-link>
    </div>
    <div class="card" v-for="g in guides" :key="g.id" @click="$router.push('/m/guide/' + g.id)">
      <div class="pad guide-row">
        <div class="guide-face">
          <img v-if="g.avatar" :src="g.avatar" :alt="g.name" />
          <span v-else>{{ (g.name || "导").slice(0, 1) }}</span>
        </div>
        <div>
          <div class="row">
            <strong>{{ g.name }}</strong>
            <span class="muted">{{ g.rating }} 分</span>
          </div>
          <p class="muted" style="margin:4px 0 0">{{ g.years }}年 · {{ g.specialties }}</p>
        </div>
      </div>
    </div>

    <div class="home-member" @click="goMember">
      <strong>{{ store.profile?.isMember ? "会员中心" : "限时开通会员" }}</strong>
      <span>{{ store.profile?.isMember ? "本线路自动按会员价报价，另享 95 折" : (store.meta?.memberCopy || "年费 99 元，赠送一次 100 以内的团，线路额外 95 折") }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { OFFER_TYPES } from "@/utils/offer";

const router = useRouter();
const store = useUserStore();
const list = ref([]);
const schedules = ref([]);
const upcoming = ref([]);
const allGuides = ref([]);
const home = ref({ brand: {}, cities: [], tags: [], festivals: [], months: [], durations: [] });
const city = ref("");
const monthKey = ref("");
const monthDays = ref([]);
const festivalKey = ref("");
const offerFilter = ref("");
const heroIndex = ref(0);
const cityHeroIndex = ref(0);
const guides = computed(() => allGuides.value.slice(0, 4));
const offers = OFFER_TYPES;

const theme = computed(() => list.value.find((r) => r.days === 3) || list.value.find((r) => r.days === 2) || list.value[0]);
const weekend = computed(() => list.value.filter((r) => r.days === 1).slice(0, 4));
const groups = computed(() =>
  schedules.value
    .filter((s) => s.status !== "cancelled" && Number(s.remain) > 0)
    .filter((s) => !offerFilter.value || s.offerType === offerFilter.value)
    .slice(0, 6)
);
const citySlides = computed(() => {
  const hit = (home.value.cities || []).find((c) => c.name === city.value);
  if (hit?.slides?.length) return hit.slides;
  return (hit?.gallery || []).map((url) => ({ url, routeId: 0, title: city.value }));
});
const brandSlides = computed(() => {
  if (home.value.brand?.slides?.length) return home.value.brand.slides;
  return (home.value.brand?.gallery || []).map((url) => ({ url, routeId: 0, title: "" }));
});
const brandSlide = computed(() => {
  const list = brandSlides.value;
  if (!list.length) return null;
  return list[heroIndex.value % list.length];
});
const citySlide = computed(() => {
  const list = citySlides.value;
  if (!list.length) return null;
  return list[cityHeroIndex.value % list.length];
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

let heroTimer;

onMounted(async () => {
  const [homeRes, routesRes, schRes, guideRes] = await Promise.all([
    http.get("/home").catch(() => ({ data: {} })),
    http.get("/routes"),
    http.get("/schedules").catch(() => ({ data: [] })),
    http.get("/guides").catch(() => ({ data: [] })),
  ]);
  home.value = homeRes.data || {};
  city.value = home.value.cities?.[0]?.name || "";
  monthKey.value = home.value.months?.[0]?.key || "";
  monthDays.value = home.value.monthDays || [];
  list.value = routesRes.data || [];
  schedules.value = schRes.data || [];
  allGuides.value = guideRes.data || [];
  if (store.token) {
    try {
      upcoming.value = (await http.get("/me/trips")).data || [];
    } catch {
      upcoming.value = [];
    }
  }
  heroTimer = setInterval(() => {
    const n = brandSlides.value.length;
    if (n) heroIndex.value = (heroIndex.value + 1) % n;
    const cn = citySlides.value.length;
    if (cn) cityHeroIndex.value = (cityHeroIndex.value + 1) % cn;
  }, 4000);
});
onUnmounted(() => clearInterval(heroTimer));

function countOn(date) {
  return schedules.value.filter((s) => s.startDate === date && s.status !== "cancelled").length;
}
function pickCity(name) {
  city.value = name;
  cityHeroIndex.value = 0;
}
function goSlide(slide) {
  if (slide?.routeId) router.push("/m/route/" + slide.routeId);
}
function goRoutes(query) {
  router.push({ path: "/m/routes", query });
}
function goPublish(date) {
  if (!store.token) {
    router.push({ path: "/m/login", query: { redirect: date ? `/m/publish?date=${date}` : "/m/publish" } });
    return;
  }
  router.push({ path: "/m/publish", query: date ? { date } : {} });
}
function goDay(d) {
  if (!d.count) {
    goPublish(d.date);
    return;
  }
  const hit = schedules.value.find((s) => s.startDate === d.date && s.status !== "cancelled");
  if (hit) router.push("/m/schedule/" + hit.id);
  else router.push("/m/chain");
}
async function pickMonth(key) {
  monthKey.value = key;
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
</script>
