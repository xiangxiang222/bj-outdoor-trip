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
        <button class="hero-discover" type="button" @click="discoverWeekend">看看本周末 <TravelIcon name="arrow" /></button>
        <div class="hero-dots" aria-label="切换山野图片"><button v-for="(photo, i) in fallbackPhotos" :key="photo" type="button" :class="{ selected: heroIndex % fallbackPhotos.length === i }" :aria-label="'第 ' + (i + 1) + ' 张'" :aria-pressed="heroIndex % fallbackPhotos.length === i" @click="heroIndex = i"></button></div>
      </div>
      <div class="hero-photo-credit"><span>BEIYE · OUTDOOR</span><i></i><span>山野精选</span></div>
    </div>

    <div class="home-pad">
    <form class="discovery-search" @submit.prevent="discoverTrips">
      <div class="discovery-search-title"><span class="search-caption">给周末，一个好去处</span><span>从北京出发 <TravelIcon name="pin" /></span></div>
      <div class="discovery-search-fields">
        <label class="discovery-input"><TravelIcon name="search" /><input v-model="query" type="search" :placeholder="searchHint" aria-label="搜索线路、目的地或发起人" /></label>
        <label class="discovery-date"><TravelIcon name="calendar" /><input v-model="date" type="date" :min="today" :max="lastDepartureDay" aria-label="出发日期" @change="onSearchDate" /><span v-if="!date">{{ hasTimeFilter ? selectedTimeLabel : '出发日期不限' }}</span></label>
        <button class="btn discovery-submit" type="submit">寻找我的山野 <TravelIcon name="arrow" /></button>
      </div>
      <div class="search-hot"><span>热门灵感</span><button v-for="word in ['长城', '古北水镇', '徒步', '草原']" :key="word" type="button" @click="searchDestination(word)">{{ word }}</button></div>
    </form>
    <router-link class="discovery-language-entry" data-testid="home-discovery-entry" to="/m/discover"><span class="discovery-language-symbol"><TravelIcon name="compass" /></span><span><strong>说说你想怎么玩</strong><small>时间、预算和偏好，一起说清楚</small></span><TravelIcon name="arrow" /></router-link>
    <div class="journey-shortcuts">
      <button type="button" @click="setView('routes')"><span><TravelIcon name="mountain" /></span><strong>精选线路</strong><small>去看更大的世界</small></button>
      <button type="button" @click="goPublish('', 'campus')"><span><TravelIcon name="school" /></span><strong>高校同行</strong><small>发起跨校旅程</small></button>
      <button type="button" @click="goPublish('', 'company')"><span><TravelIcon name="building" /></span><strong>公司团建</strong><small>团队一起出发</small></button>
      <button type="button" @click="discoverCampusTrips"><span><TravelIcon name="campus-pals" /></span><strong>校园搭子</strong><small>发现跨校旅程</small></button>
    </div>
    <section class="destination-section" aria-label="山野出游灵感">
      <div class="section-heading"><div><span class="section-eyebrow">A LITTLE ESCAPE</span><h2>走出日常，自然会有答案</h2></div><router-link class="destination-caption" to="/m/guides">专业领队 ›</router-link></div>
      <div class="destination-grid">
        <button v-for="place in destinations" :key="place.keyword" class="destination-card" type="button" @click="searchDestination(place.keyword)"><img :src="place.photo" :alt="place.name" loading="lazy" /><span class="destination-shade"></span><span class="destination-tag">{{ place.tag }}</span><span class="destination-copy"><small>{{ place.en }}</small><strong>{{ place.name }}</strong><em>{{ place.copy }}</em></span><TravelIcon name="arrow" /></button>
      </div>
    </section>
    <section class="campus-card" aria-label="校园认证">
      <span class="campus-ridge" aria-hidden="true"></span>
      <span class="campus-pass" aria-hidden="true"><span class="campus-pass-back"></span><span class="campus-pass-face"><TravelIcon name="mountain" /><span class="campus-pass-lines"></span><span class="campus-pass-stamp"><TravelIcon name="check" /></span></span></span>
      <div class="campus-copy">
        <span class="campus-eyebrow">校园礼遇<i></i></span>
        <strong>让青春，多一种出发</strong>
        <div class="campus-card-footer"><p>认证校园身份，发现专属旅程</p><router-link class="campus-cta" to="/m/student">{{ store.profile?.isStudent || store.profile?.isAlumni ? '已认证' : store.profile?.studentStatus === 'pending' ? '认证进度' : '去认证' }}<span aria-hidden="true">↗</span></router-link></div>
      </div>
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
    <section class="departure-tools" data-testid="home-time-bar" aria-label="按出发时间选团">
      <div class="departure-tools-head"><h3>什么时候出发</h3><span>给山野，留一点时间</span></div>
      <div class="departure-shortcuts" role="group" aria-label="出发时间快捷选择">
        <button type="button" data-testid="time-any" :class="{ on: !hasTimeFilter }" :aria-pressed="!hasTimeFilter" @click="clearDepartureTime">不限日期</button>
        <button type="button" data-testid="time-weekend" :class="{ on: timePreset === 'weekend' }" :aria-pressed="timePreset === 'weekend'" @click="selectTimePreset('weekend')">本周末</button>
        <button type="button" data-testid="time-nextweekend" :class="{ on: timePreset === 'nextweekend' }" :aria-pressed="timePreset === 'nextweekend'" @click="selectTimePreset('nextweekend')">下周末</button>
        <button type="button" data-testid="time-calendar" :class="{ on: customTimeSelected }" :aria-pressed="customTimeSelected" aria-haspopup="dialog" :aria-expanded="dateSheet" @click="openDepartureCalendar"><TravelIcon name="calendar" /><span>{{ customTimeLabel }}</span><span class="departure-chevron" aria-hidden="true">⌄</span></button>
      </div>
    </section>
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
        <button class="tool-btn" type="button" @click="fold.extra = !fold.extra">{{ fold.extra ? "收起" : "更多筛选" }}</button>
      </div>
    </div>

    <div class="chips">
      <button class="chip" :class="{ on: !hostKind }" type="button" @click="clearHost()">全部团</button>
      <button class="chip" :class="{ on: hostKind === 'official' }" type="button" @click="toggleHost('official')">官方</button>
      <button class="chip" :class="{ on: hostKind === 'company' }" type="button" @click="toggleHost('company')">公司</button>
      <button class="chip" :class="{ on: hostKind === 'campus' }" type="button" @click="toggleHost('campus')">高校</button>
      <button class="chip" :class="{ on: hostKind === 'individual' }" type="button" @click="toggleHost('individual')">个人</button>
    </div>

    <div v-if="fold.extra" class="filter-panel">
      <h3 class="departure-options-title">优惠与范围</h3>
      <div class="chips" v-if="hostKind === 'company' && hostFacets.companies.length">
        <div class="chip" :class="{ on: !companyName }" @click="companyName = ''">全部公司</div>
        <div class="chip" :class="{ on: companyName === n }" v-for="n in hostFacets.companies" :key="n" @click="toggleCompany(n)">{{ n }}</div>
      </div>
      <div class="chips" v-if="hostKind === 'campus' && hostFacets.schools.length">
        <div class="chip" :class="{ on: !school }" @click="school = ''">全部高校</div>
        <div class="chip" :class="{ on: school === n }" v-for="n in hostFacets.schools" :key="n" @click="toggleSchool(n)">{{ n }}</div>
      </div>
      <p class="filter-hint">按优惠类型筛选，可与上方团型一起使用。</p>
      <div class="chips">
        <button type="button" class="offer-chip" v-for="o in offers" :key="o.key" :aria-pressed="offerFilter === o.key" :style="{ background: o.color, opacity: offerFilter && offerFilter !== o.key ? 0.45 : 1 }" @click="offerFilter = offerFilter === o.key ? '' : o.key">{{ o.label }}</button>
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
        <p class="muted">{{ hasTimeFilter ? '这个出发时间暂时没有合适的团，换个日期看看。' : '过审的团会出现在这里。也可以先看官方线路。' }}</p>
        <div class="catalog-row" style="margin:10px 0 0">
          <button v-if="hasTimeFilter" class="tool-btn ghost-line" type="button" data-testid="clear-departure-time" @click="clearDepartureTime">清除时间条件</button>
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

    <Teleport to="body">
      <div v-if="dateSheet" class="departure-mask" @click.self="closeDepartureCalendar">
        <section ref="dateDialog" class="departure-sheet" role="dialog" aria-modal="true" aria-label="选择出发日期" @keydown="onCalendarKeydown">
          <button ref="dateClose" class="departure-close" type="button" aria-label="关闭日期选择" @click="closeDepartureCalendar">×</button>
          <header class="departure-sheet-head"><span>MAKE TIME FOR THE WILD</span><h2>选择出发日期</h2><p>先留出一天，去赴一场山野之约。</p></header>
          <div class="departure-sheet-body">
          <div class="departure-month-nav">
            <button type="button" aria-label="上个月" :disabled="sheetMonthIndex <= 0" @click="moveDepartureMonth(-1)"><TravelIcon name="chevron" /></button>
            <h3>{{ sheetMonthLabel }}</h3>
            <button type="button" aria-label="下个月" :disabled="sheetMonthIndex >= selectableMonths.length - 1" @click="moveDepartureMonth(1)"><TravelIcon name="chevron" /></button>
          </div>
          <div class="departure-weekdays" aria-hidden="true"><span v-for="day in ['周一','周二','周三','周四','周五','周六','周日']" :key="day">{{ day }}</span></div>
          <div class="departure-month-grid" data-testid="departure-month-grid" role="group" :aria-label="sheetMonthLabel + '出发日期'">
            <template v-for="cell in sheetDays" :key="cell.key">
              <span v-if="cell.blank" class="departure-blank" aria-hidden="true"></span>
              <button v-else type="button" :data-testid="'departure-day-' + cell.date" :class="{ on: draftDate === cell.date, 'has-trips': cell.count > 0, today: cell.date === today }" :disabled="cell.disabled" :aria-pressed="draftDate === cell.date" :aria-label="cell.date + '出发'" :data-count="cell.count" @click="selectDraftDate(cell.date)"><strong>{{ cell.label }}</strong><small>{{ cell.count ? cell.count + '团' : cell.date === today ? '今天' : '—' }}</small></button>
            </template>
          </div>
          <div class="departure-month-option"><button type="button" :class="{ on: draftWholeMonth }" :aria-pressed="draftWholeMonth" @click="selectDraftMonth"><span class="departure-option-dot" aria-hidden="true">{{ draftWholeMonth ? '✓' : '' }}</span>看看整月出发</button><span>数量随当前筛选更新</span></div>
          <div v-if="futureFestivals.length" class="departure-festivals"><h3>假日计划</h3><div><button v-for="festival in futureFestivals" :key="festival.key" type="button" :class="{ on: draftFestival === festival.key }" :aria-pressed="draftFestival === festival.key" @click="selectDraftFestival(festival.key)">{{ festival.name }}</button></div></div>
          </div>
          <footer class="departure-sheet-foot"><div class="departure-selection"><span>{{ draftTimeLabel }}</span><small>{{ draftResultCount }} 个团可查看</small></div><div class="departure-sheet-actions"><button class="departure-reset" type="button" @click="resetDraftTime">不限日期</button><button class="departure-apply" type="button" data-testid="departure-apply" @click="applyDepartureTime">查看 {{ draftResultCount }} 个团 <TravelIcon name="arrow" /></button></div></footer>
        </section>
      </div>
    </Teleport>
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
import { availableDepartures, buildDepartureMonth, chinaDay, departureMonths, matchesDepartureTime, weekendRange } from "@/utils/departureDates";
import RouteCatalog from "@/components/RouteCatalog.vue";
import TripKind from "@/components/TripKind.vue";
import TravelIcon from "@/components/TravelIcon.vue";

const pageRoute = useRoute();
const router = useRouter();
const store = useUserStore();
const schedules = ref([]);
const feedStart = ref(null);
const departureNow = ref(new Date());
const today = computed(() => chinaDay(departureNow.value));
const selectableMonths = computed(() => departureMonths(departureNow.value));
const lastDepartureDay = computed(() => buildDepartureMonth(selectableMonths.value.at(-1)?.key, [], departureNow.value).filter((cell) => !cell.blank).at(-1)?.date || today.value);
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
const timePreset = ref("any");
const dateSheet = ref(false);
const dateDialog = ref(null);
const dateClose = ref(null);
const sheetMonth = ref(today.value.slice(0, 7));
const draftDate = ref("");
const draftMonth = ref("");
const draftFestival = ref("");
const draftPreset = ref("any");
let dateTrigger;
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
const baseGroups = computed(() => availableDepartures(processFeed(schedules.value, {
  query: query.value,
  sort: sort.value,
  city: city.value,
  tag: tag.value,
  offerFilter: offerFilter.value,
  channel: "trip",
  hostKind: hostKind.value,
  companyName: companyName.value,
  school: school.value,
}), departureNow.value));
const currentTimeSelection = computed(() => ({
  preset: timePreset.value,
  date: date.value,
  month: monthPicked.value ? monthKey.value : "",
  festivalDates: festivalKey.value ? activeFestival.value?.dates || [] : undefined,
}));
const groups = computed(() => baseGroups.value.filter((row) => matchesDepartureTime(row, currentTimeSelection.value, departureNow.value)));
const hasTimeFilter = computed(() => Boolean(date.value || monthPicked.value || festivalKey.value || timePreset.value !== "any"));
const customTimeSelected = computed(() => Boolean(date.value || monthPicked.value || festivalKey.value));
const customTimeLabel = computed(() => date.value ? date.value.slice(5).replace("-", ".") : monthPicked.value ? monthKey.value : activeFestival.value?.name || "选日期");
const selectedTimeLabel = computed(() => timeLabel(currentTimeSelection.value, activeFestival.value?.name));
const futureFestivals = computed(() => (home.value.festivals || []).map((festival) => ({
  ...festival,
  dates: (festival.dates || []).filter((day) => day.date >= today.value && day.date <= lastDepartureDay.value),
})).filter((festival) => festival.dates.length));
const sheetMonthIndex = computed(() => selectableMonths.value.findIndex((month) => month.key === sheetMonth.value));
const sheetMonthLabel = computed(() => sheetMonth.value.replace("-", "."));
const sheetDays = computed(() => buildDepartureMonth(sheetMonth.value, baseGroups.value, departureNow.value));
const draftWholeMonth = computed(() => draftMonth.value === sheetMonth.value);
const draftFestivalItem = computed(() => futureFestivals.value.find((festival) => festival.key === draftFestival.value));
const draftTimeSelection = computed(() => ({
  preset: draftPreset.value,
  date: draftDate.value,
  month: draftMonth.value,
  festivalDates: draftFestival.value ? draftFestivalItem.value?.dates || [] : undefined,
}));
const draftTimeLabel = computed(() => timeLabel(draftTimeSelection.value, draftFestivalItem.value?.name));
const draftResultCount = computed(() => baseGroups.value.filter((row) => matchesDepartureTime(row, draftTimeSelection.value, departureNow.value)).length);
const visibleGroups = computed(() => groups.value.slice(0, visibleFeedCount.value));
watch(() => groups.value.map((row) => row.id).join(","), () => { visibleFeedCount.value = 8; });
const hostFacets = computed(() => collectHostFacets(schedules.value));
const picked = computed(() => {
  const rows = [];
  if (city.value) rows.push({ key: "city", label: city.value, clear: () => { city.value = ""; } });
  if (hasTimeFilter.value) rows.push({ key: "time", label: selectedTimeLabel.value, clear: clearDepartureTime });
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
let departureClock;
let homeDisposed = false;

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
  schedules.value = schRes.data || [];
  loading.value = false;
  if (pageRoute.query.host === "campus") discoverCampusTrips();
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
  if (homeDisposed) return;
  departureClock = setInterval(() => { departureNow.value = new Date(); }, 60000);
  heroTimer = setInterval(() => {
    const n = brandSlides.value.length;
    if (n) heroIndex.value = (heroIndex.value + 1) % n;
  }, 4000);
});
onUnmounted(() => { homeDisposed = true; clearInterval(heroTimer); clearInterval(departureClock); });

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
function toggleCity(name) {
  city.value = city.value === name ? "" : name;
}
function timeLabel(selection, festivalName) {
  if (selection.date) return selection.date.replace(/-/g, ".");
  if (selection.month) return selection.month + " · 整月";
  if (selection.festivalDates != null) return festivalName || "假日计划";
  if (selection.preset === "weekend" || selection.preset === "nextweekend") {
    const range = weekendRange(selection.preset, departureNow.value);
    return (selection.preset === "weekend" ? "本周末" : "下周末") + " · " + range.start.slice(5).replace("-", ".") + (range.start !== range.end ? "–" + range.end.slice(5).replace("-", ".") : "");
  }
  return "出发日期不限";
}
function clearDepartureTime() {
  date.value = "";
  monthPicked.value = false;
  monthKey.value = "";
  festivalKey.value = "";
  timePreset.value = "any";
}
function selectTimePreset(preset) {
  clearDepartureTime();
  departureNow.value = new Date();
  timePreset.value = preset;
  setView("trips");
}
function onSearchDate() {
  monthPicked.value = false;
  monthKey.value = "";
  festivalKey.value = "";
  timePreset.value = "any";
  if (date.value) setView("trips");
}
function resetDraftTime() {
  draftDate.value = "";
  draftMonth.value = "";
  draftFestival.value = "";
  draftPreset.value = "any";
}
function openDepartureCalendar() {
  departureNow.value = new Date();
  dateTrigger = document.activeElement;
  draftDate.value = date.value;
  draftMonth.value = monthPicked.value ? monthKey.value : "";
  draftFestival.value = festivalKey.value;
  draftPreset.value = timePreset.value;
  const chosenMonth = date.value.slice(0, 7) || draftMonth.value || activeFestival.value?.dates?.[0]?.date?.slice(0, 7);
  sheetMonth.value = selectableMonths.value.some((month) => month.key === chosenMonth) ? chosenMonth : today.value.slice(0, 7);
  dateSheet.value = true;
  nextTick(() => dateClose.value?.focus());
}
function closeDepartureCalendar() {
  dateSheet.value = false;
  nextTick(() => dateTrigger?.isConnected && dateTrigger.focus());
}
function moveDepartureMonth(offset) {
  const month = selectableMonths.value[sheetMonthIndex.value + offset];
  if (month) sheetMonth.value = month.key;
}
function selectDraftDate(day) {
  if (!sheetDays.value.some((cell) => cell.date === day && !cell.disabled)) return;
  const selected = draftDate.value === day;
  resetDraftTime();
  if (!selected) draftDate.value = day;
}
function selectDraftMonth() {
  const selected = draftMonth.value === sheetMonth.value;
  resetDraftTime();
  if (!selected) draftMonth.value = sheetMonth.value;
}
function selectDraftFestival(key) {
  const festival = futureFestivals.value.find((item) => item.key === key);
  if (!festival) return;
  const selected = draftFestival.value === key;
  resetDraftTime();
  if (!selected) {
    draftFestival.value = key;
    const keyMonth = festival.dates[0].date.slice(0, 7);
    if (selectableMonths.value.some((month) => month.key === keyMonth)) sheetMonth.value = keyMonth;
  }
}
function applyDepartureTime() {
  clearDepartureTime();
  date.value = draftDate.value;
  monthPicked.value = Boolean(draftMonth.value);
  monthKey.value = draftMonth.value;
  festivalKey.value = draftFestival.value;
  timePreset.value = draftPreset.value;
  closeDepartureCalendar();
}
function onCalendarKeydown(event) {
  if (event.key === "Escape") { event.preventDefault(); closeDepartureCalendar(); return; }
  if (event.key !== "Tab") return;
  const buttons = [...(dateDialog.value?.querySelectorAll("button:not(:disabled)") || [])];
  const first = buttons[0], last = buttons.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
async function discoverWeekend() {
  selectTimePreset("weekend");
  await nextTick();
  discoverTrips();
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
  clearDepartureTime();
  tag.value = "";
  offerFilter.value = "";
  companyName.value = "";
  school.value = "";
  hostKind.value = "campus";
  fold.extra = false;
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

</script>

<style scoped>
.discovery-language-entry { display:flex; align-items:center; gap:12px; padding:15px 17px; margin:15px 0 20px; border:1px solid #e3d7ef; border-radius:14px; background:#f4eef9; color:#5b3b8c; }
.discovery-language-symbol { display:grid; place-items:center; width:33px; height:33px; border:1px solid #d5c1e7; border-radius:50%; flex:none; }
.discovery-language-entry .travel-icon { width:18px; height:18px; stroke-width:1.4; flex:none; }
.discovery-language-entry > span:nth-child(2) { flex:1; min-width:0; }
.discovery-language-entry strong { display:block; font-size:calc(13px * var(--ui-scale,1)); font-weight:500; line-height:1.7; }
.discovery-language-entry small { display:block; font-size:calc(10px * var(--ui-scale,1)); color:#a08aad; line-height:1.7; margin-top:2px; }
:global(html[data-night="dark"] .discovery-language-entry) { background:#352642; border-color:#50375f; color:#dbc1f0; }
.departure-tools { --dt-purple:#5b3b8c; --dt-ink:#342a40; --dt-muted:#9a8ca6; --dt-paper:#fff; --dt-soft:#eee7f7; --dt-line:#e8e0f0; margin:4px 0 19px; padding:17px 16px 15px; border:1px solid var(--dt-line); border-radius:17px; background:var(--dt-paper); }
.departure-tools-head { display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin-bottom:13px; }
.departure-tools-head h3 { margin:0; color:var(--dt-ink); font-size:calc(14px * var(--ui-scale,1)); line-height:1.5; font-weight:500; }
.departure-tools-head > span { color:var(--dt-muted); font-size:calc(10px * var(--ui-scale,1)); line-height:1.6; text-align:right; }
.departure-shortcuts { display:grid; grid-template-columns:1fr 1fr 1fr 1.2fr; gap:6px; }
.departure-shortcuts button { display:flex; align-items:center; justify-content:center; min-width:0; gap:4px; min-height:36px; padding:8px 3px; border:1px solid transparent; border-radius:9px; color:#8a789b; background:#f9f7fc; font:inherit; font-size:calc(11px * var(--ui-scale,1)); line-height:1.6; cursor:pointer; overflow-wrap:anywhere; }
.departure-shortcuts button.on { background:var(--dt-soft); border-color:#d7c5e9; color:var(--dt-purple); font-weight:500; }
.departure-shortcuts .travel-icon { width:14px; height:14px; flex:none; stroke-width:1.4; }
.departure-chevron { color:#aa96bb; font-size:13px; flex:none; }
.departure-options-title { color:#7c658f; margin:0 0 13px; font-size:calc(13px * var(--ui-scale,1)); font-weight:500; }
.filter-panel { margin:8px 0 14px; padding:15px; border:1px solid var(--line); border-radius:14px; background:var(--card); }
.filter-hint { font-size:calc(12px * var(--ui-scale,1)); color:var(--muted); line-height:1.6; }
.filter-panel .offer-chip { border:0; font:inherit; font-size:calc(12px * var(--ui-scale,1)); }
.departure-mask { --dt-purple:#5b3b8c; --dt-ink:#342a40; --dt-muted:#94849f; --dt-paper:#fff; --dt-soft:#f2edf8; --dt-line:#e9e1f0; position:fixed; z-index:120; inset:0; display:flex; align-items:flex-end; justify-content:center; background:#21132e66; color:var(--dt-ink); font-family:'PingFang SC','Hiragino Sans GB','Noto Sans SC',sans-serif; overscroll-behavior:contain; }
.departure-mask *, .departure-mask *::before, .departure-mask *::after { box-sizing:border-box; }
.departure-mask button { color:inherit; font:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.departure-mask button:focus-visible, .departure-tools button:focus-visible { outline:2px solid #ae91ca; outline-offset:3px; }
.departure-sheet { position:relative; display:flex; flex-direction:column; width:100%; max-width:520px; max-height:92dvh; padding:25px 23px max(22px,env(safe-area-inset-bottom)); overflow:hidden; border:1px solid var(--dt-line); border-bottom:0; border-radius:25px 25px 0 0; background:var(--dt-paper); box-shadow:0 -10px 50px #3e245514; }
.departure-sheet-body { min-height:0; overflow-y:auto; overscroll-behavior:contain; }
.departure-close { position:absolute; right:18px; top:17px; width:34px; height:34px; border:0; background:transparent; color:var(--dt-muted) !important; font-size:28px !important; line-height:1; }
.departure-sheet-head { flex:none; padding:0 30px 18px 1px; }
.departure-sheet-head > span { color:#ab93bc; font-size:8px; letter-spacing:.14em; line-height:1.8; }
.departure-sheet-head h2 { margin:7px 0 6px; color:var(--dt-purple); font-size:calc(23px * var(--ui-scale,1)); font-weight:500; line-height:1.5; }
.departure-sheet-head p { margin:0; color:var(--dt-muted); font-size:calc(11px * var(--ui-scale,1)); line-height:1.8; }
.departure-month-nav { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0 0 13px; padding-top:14px; border-top:1px solid var(--dt-line); }
.departure-month-nav h3 { margin:0; color:var(--dt-ink); font-size:calc(15px * var(--ui-scale,1)); font-weight:500; line-height:1.7; }
.departure-month-nav button { display:grid; place-items:center; width:34px; height:34px; border:1px solid var(--dt-line); border-radius:50%; background:var(--dt-paper); color:var(--dt-purple); flex:none; }
.departure-month-nav button:first-child .travel-icon { transform:rotate(180deg); }
.departure-month-nav .travel-icon { width:14px; height:14px; stroke-width:1.3; }
.departure-month-nav button:disabled { opacity:.3; cursor:default; }
.departure-weekdays, .departure-month-grid { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:4px; }
.departure-weekdays { padding:0 0 10px; color:#b09dbd; font-size:calc(10px * var(--ui-scale,1)); text-align:center; }
.departure-weekdays span:nth-last-child(-n+2) { color:#9b7eb2; }
.departure-month-grid button { display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0; min-height:51px; padding:5px 1px; border:1px solid transparent; border-radius:10px; background:transparent; }
.departure-month-grid strong { font-size:calc(14px * var(--ui-scale,1)); font-weight:400; line-height:1.4; background:transparent; color:var(--dt-ink); }
.departure-month-grid small { min-height:14px; color:#c1b5c9; font-size:calc(8px * var(--ui-scale,1)); line-height:1.6; }
.departure-month-grid .has-trips { background:#faf8fc; }
.departure-month-grid .has-trips small { color:#a18ab4; }
.departure-month-grid .today strong { color:var(--dt-purple); font-weight:600; }
.departure-month-grid button:disabled { opacity:.3; cursor:default; }
.departure-month-grid button.on { background:var(--dt-purple); border-color:var(--dt-purple); box-shadow:0 4px 10px #5b3b8c1a; }
.departure-month-grid button.on strong, .departure-month-grid button.on small { color:#fff; }
.departure-month-option { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:14px; padding:13px 0; border-top:1px solid var(--dt-line); }
.departure-month-option button { display:flex; align-items:center; gap:7px; padding:0; border:0; background:transparent; color:var(--dt-muted); font-size:calc(11px * var(--ui-scale,1)); line-height:1.7; text-align:left; }
.departure-option-dot { display:grid; place-items:center; width:15px; height:15px; border:1px solid #d9cce4; border-radius:50%; color:var(--dt-purple); font-size:10px; flex:none; }
.departure-month-option button.on { color:var(--dt-purple); }.departure-month-option button.on .departure-option-dot { background:var(--dt-soft); border-color:#b89ccd; }
.departure-month-option > span { color:#b4a3c0; font-size:calc(9px * var(--ui-scale,1)); line-height:1.6; text-align:right; }
.departure-festivals { padding:6px 0 16px; }
.departure-festivals h3 { margin:0 0 10px; color:var(--dt-muted); font-size:calc(10px * var(--ui-scale,1)); font-weight:400; }
.departure-festivals > div { display:flex; flex-wrap:wrap; gap:6px; }
.departure-festivals button { padding:5px 10px; border:1px solid var(--dt-line); border-radius:7px; background:var(--dt-paper); color:#9c87ad; font-size:calc(10px * var(--ui-scale,1)); line-height:1.5; }
.departure-festivals button.on { background:var(--dt-soft); color:var(--dt-purple); border-color:#d7c5e8; }
.departure-sheet-foot { flex:none; padding-top:14px; border-top:1px solid var(--dt-line); }
.departure-selection { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:13px; line-height:1.6; }
.departure-selection > span { color:#8a719e; font-size:calc(11px * var(--ui-scale,1)); }
.departure-selection small { color:#af9bbb; font-size:calc(9px * var(--ui-scale,1)); text-align:right; }
.departure-sheet-actions { display:flex; gap:10px; }
.departure-reset { flex:none; padding:11px 16px; border:1px solid var(--dt-line); border-radius:999px; background:var(--dt-paper); color:var(--dt-muted) !important; font-size:calc(12px * var(--ui-scale,1)) !important; line-height:1.5; }
.departure-apply { display:flex; align-items:center; justify-content:center; gap:12px; min-width:0; flex:1; padding:11px 16px; border:1px solid var(--dt-purple); border-radius:999px; background:var(--dt-purple); color:var(--dt-paper) !important; font-size:calc(13px * var(--ui-scale,1)) !important; line-height:1.5; }
.departure-apply .travel-icon { width:18px; height:18px; flex:none; stroke-width:1.3; }
:global(html[data-night="dark"] .departure-tools), :global(html[data-night="dark"] .departure-mask) { --dt-purple:#d6bbf2; --dt-ink:#eee6f4; --dt-muted:#b8a5c7; --dt-paper:#231b2c; --dt-soft:#382946; --dt-line:#45324f; }
:global(html[data-night="dark"] .departure-tools .departure-shortcuts button) { background:#2a2034; color:#b9a5ca; }
:global(html[data-night="dark"] .departure-tools .departure-shortcuts button.on) { background:#3e2d50; color:#e2caf6; border-color:#665078; }
:global(html[data-night="dark"] .departure-mask .departure-month-grid .has-trips) { background:#2f233a; }
:global(html[data-night="dark"] .departure-mask .departure-month-grid button.on) { background:#806099; border-color:#a688bf; }
:global(html[data-night="dark"] .departure-mask .departure-apply) { color:#231b2c !important; }
@media(max-width:360px) { .departure-tools { padding:14px 11px; }.departure-tools-head { gap:8px; }.departure-tools-head > span { font-size:calc(9px * var(--ui-scale,1)); }.departure-shortcuts { gap:4px; }.departure-shortcuts button { font-size:calc(10px * var(--ui-scale,1)); }.departure-shortcuts .travel-icon { width:12px; height:12px; }.departure-sheet { padding-inline:17px; }.departure-month-grid { gap:3px; }.departure-month-grid button { min-height:48px; }.departure-reset { padding-inline:12px; }.departure-apply { padding-inline:12px; } }
@media(min-width:700px) { .departure-tools { margin:3px 0 22px; padding:18px 20px; }.departure-tools-head { margin-bottom:14px; }.departure-shortcuts { max-width:610px; gap:10px; }.departure-shortcuts button { font-size:calc(12px * var(--ui-scale,1)); padding:9px 10px; }.departure-mask { align-items:center; padding:25px; }.departure-sheet { border-bottom:1px solid var(--dt-line); border-radius:24px; padding:28px 30px; max-height:90dvh; }.departure-month-grid button { min-height:57px; } }
</style>
