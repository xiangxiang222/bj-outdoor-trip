<template>
  <div v-if="route" class="route-profile">
    <div v-if="!embedded && route.cover" class="rp-hero" @click="previewUrl(route.cover)">
      <img :src="route.cover" alt="" />
      <div class="rp-hero-copy">
        <h2>{{ route.title }}</h2>
        <p v-if="route.subtitle">{{ route.subtitle }}</p>
      </div>
    </div>
    <template v-else>
      <h2 class="rp-title">{{ route.title }}</h2>
      <p v-if="route.subtitle" class="muted rp-sub">{{ route.subtitle }}</p>
    </template>

    <LivePulse v-if="!embedded && route.id" scope="route" :route-id="route.id" />

    <div v-if="stats.length" class="rp-stats">
      <div v-for="s in stats" :key="s.label" class="rp-stat">
        <b>{{ s.value }}</b>
        <span>{{ s.label }}</span>
      </div>
    </div>
    <p v-if="route.region" class="muted rp-region">{{ route.region }}</p>
    <div v-if="(route.playTags || route.tags || []).length" class="tag-row">
      <span
        class="play-tag sm"
        v-for="t in route.playTags || route.tags"
        :key="t.id || t"
        :style="{ background: t.color || '#2d6a4f' }"
      >{{ t.name || t }}</span>
    </div>

    <div v-if="nextTrip" class="rp-next">
      <span>最近出发</span>
      <b>{{ nextTrip.startDate }}</b>
      <span>{{ nextTrip.meetupPoint }} {{ nextTrip.meetupTime }}</span>
    </div>

    <div class="rp-price">
      <div>
        <TripPrices
          :origin="route.priceTiers?.[0]?.price"
          :member-price="route.priceTiers?.[0]?.memberPrice"
          :student-price="route.priceTiers?.[0]?.studentPrice"
          :trip-price="route.priceTiers?.[0]?.price"
          compact
        />
        <div class="muted">会员额外 95 折</div>
      </div>
      <button class="btn ghost" type="button" @click="$emit('fav')">{{ route.favored ? "已收藏" : "收藏" }}</button>
    </div>

    <nav v-if="jumps.length > 1" class="rp-jump">
      <button v-for="j in jumps" :key="j.id" type="button" @click="goSection(j.id)">{{ j.label }}</button>
    </nav>

    <template v-if="route.highlights?.length">
      <div class="h2">亮点</div>
      <div class="rp-hl">
        <div v-for="(h, i) in route.highlights" :key="i" class="rp-hl-item"><i>{{ i + 1 }}</i>{{ h }}</div>
      </div>
    </template>

    <div id="sec-intro" class="rp-anchor" v-if="story.length || route.description">
      <div class="h2">线路介绍</div>
      <div class="card" v-if="story.length"><div class="pad">
        <RouteStory :blocks="story" @preview="previewUrl" />
      </div></div>
      <div class="card" v-else><div class="pad">
        <p class="rp-desc">{{ route.description }}</p>
      </div></div>
    </div>

    <div id="sec-itin" class="rp-anchor" v-if="route.itinerary?.length">
      <div class="h2">行程安排</div>
      <div class="card"><div class="pad">
        <div class="rp-stop" v-for="(it, i) in route.itinerary" :key="i">
          <div class="rp-rail"><i></i></div>
          <div class="rp-stop-main">
            <div class="rp-stop-copy">
              <div class="time">{{ it.time }} · {{ it.title }}</div>
              <div class="muted">{{ it.detail }}</div>
            </div>
            <img v-if="it.photo" class="rp-stop-photo" :src="it.photo" alt="" @click="previewUrl(it.photo)" />
          </div>
        </div>
      </div></div>
    </div>

    <template v-if="route.priceTiers?.length">
      <div class="h2">人数阶梯价</div>
      <div class="rp-tiers">
        <div v-for="t in route.priceTiers" :key="t.minPeople" class="rp-tier">
          <span>{{ t.minPeople }} 人起</span>
          <strong>¥{{ t.price }}</strong>
          <span>会员 ¥{{ t.memberPrice }}</span>
          <span v-if="t.studentPrice">学生 ¥{{ t.studentPrice }}</span>
        </div>
      </div>
      <p class="muted rp-tier-note">个人或高校开团先报名占座，按当前人数档位计价，出行前付款；公司开团可先上车，结束后按最终人数统一支付。</p>
    </template>

    <template v-if="route.buses?.length">
      <div class="h2">可选车型</div>
      <div class="rp-buses">
        <div v-for="b in route.buses" :key="b.id" class="rp-bus">
          <b>{{ b.name }}</b>
          <span>{{ b.seats }} 座</span>
          <span v-if="b.description" class="muted">{{ b.description }}</span>
        </div>
      </div>
    </template>

    <div id="sec-fee" class="rp-anchor" v-if="route.feeInclude || route.feeExclude || route.notices">
      <div class="h2">费用说明</div>
      <div v-if="route.feeInclude || route.feeExclude" class="rp-fees" :class="{ single: !route.feeInclude || !route.feeExclude }">
        <div v-if="route.feeInclude" class="rp-fee">
          <b>包含</b>
          <p>{{ route.feeInclude }}</p>
        </div>
        <div v-if="route.feeExclude" class="rp-fee">
          <b>不含</b>
          <p>{{ route.feeExclude }}</p>
        </div>
      </div>
      <p v-if="route.notices" class="rp-note">{{ route.notices }}</p>
    </div>

    <RouteVideos :videos="route.videos || []" />

    <div id="sec-photos" class="rp-anchor" v-if="album.length">
      <div class="h2">更多照片</div>
      <img v-if="album.length === 1" class="rp-album-one" :src="album[0]" alt="" @click="previewUrl(album[0])" />
      <div v-else class="rp-album">
        <img v-for="g in album" :key="g" :src="g" alt="" @click="previewUrl(g)" />
      </div>
    </div>

    <template v-if="refundPolicy">
      <div class="h2">退费规则</div>
      <div class="card"><div class="pad">
        <p class="muted rp-desc">{{ refundPolicy.summary }}</p>
        <p v-for="line in refundPolicy.lines" :key="line.text" class="rp-refund">{{ line.text }}</p>
      </div></div>
    </template>

    <template v-if="!embedded">
      <div id="sec-go" class="h2 rp-anchor">可报名排期</div>
      <div class="card" v-for="s in route.schedules" :key="s.id" @click="$emit('open-schedule', s.id)">
        <div class="pad">
          <div class="row">
            <strong>{{ s.startDate }}{{ s.endDate !== s.startDate ? " 至 " + s.endDate : "" }}</strong>
            <TripKind :kind="s.kind" :type="s.organizerType" :channel="s.channel" />
          </div>
          <div class="muted">{{ s.bus?.name }} · {{ s.meetupPoint }} {{ s.meetupTime }}</div>
          <p v-if="s.guide" class="guide-hit" @click.stop="$emit('open-guide', s.guide.id)">导游 {{ s.guide.name }} · 查看详情</p>
          <p v-else class="muted guide-hit" @click.stop="$emit('open-guides')">成团后匹配导游 · 先看看领队</p>
          <div class="progress"><i :style="{ width: Math.min(100, (s.enrolled / s.maxSeats) * 100) + '%' }"></i></div>
          <div class="row muted"><span>已报 {{ s.enrolled }}/{{ s.maxSeats }} · 成团 {{ s.minGroupSize }} 人</span><span>当前约 ¥{{ s.quote.price }}</span></div>
        </div>
      </div>
      <p class="muted" v-if="!route.schedules?.length">暂无排期，可以自己开一团。</p>
    </template>

    <div class="h2">出行评价 <span v-if="reviews.count" class="muted">{{ reviews.avg }} 分 · {{ reviews.count }} 条</span></div>
    <div class="card" v-if="reviews.list?.length">
      <div class="pad review-item" v-for="rv in reviews.list" :key="rv.id">
        <div class="row">
          <strong>{{ rv.name }}</strong>
          <span v-if="rv.virtual" class="review-virtual">虚拟用户</span>
          <span class="stars">{{ starText(rv.rating) }}</span>
        </div>
        <p v-if="rv.content">{{ rv.content }}</p>
        <p class="muted">{{ rv.createdAt }}</p>
      </div>
    </div>
    <p class="muted" v-else>还没有评价。报名后可在「我的报名」写下体验。</p>

    <div class="h2">装备清单</div>
    <div class="card"><div class="pad">
      <div v-if="route.packingList?.length" class="rp-packs">
        <span v-for="item in route.packingList" :key="item">{{ item }}</span>
      </div>
      <p v-else class="muted rp-desc">{{ route.equipment || "详见装备说明。" }}</p>
    </div></div>

    <template v-if="!embedded && faqs.length">
      <div class="h2">常见问题</div>
      <div class="card"><div class="pad">
        <div class="faq-item" v-for="f in faqs" :key="f.q">
          <strong>{{ f.q }}</strong>
          <p class="muted">{{ f.a }}</p>
        </div>
      </div></div>
    </template>

    <div v-if="!embedded" class="rp-actions">
      <button class="btn ghost" type="button" @click="$emit('share')">分享报名</button>
      <button v-if="route.status === 'on'" class="btn" type="button" @click="$emit('open-schedule-create')">发布排期</button>
    </div>

    <Teleport to="body">
      <div v-if="previewIndex != null" class="lightbox" @click.self="previewIndex = null">
        <img :src="previewList[previewIndex]" @click.stop="next" />
        <div class="lb-nav">
          <button class="lb-btn" type="button" @click.stop="prev">上一张</button>
          <button class="lb-btn" type="button" @click.stop="previewIndex = null">关闭</button>
          <button class="lb-btn" type="button" @click.stop="next">下一张</button>
        </div>
        <div class="lb-hint">{{ previewIndex + 1 }} / {{ previewList.length }} · 点击图片也可切下一张</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { starText } from "@/utils/labels";
import { storyAlbum } from "@/utils/story";
import TripPrices from "@/components/TripPrices.vue";
import RouteStory from "@/components/RouteStory.vue";
import RouteVideos from "@/components/RouteVideos.vue";
import LivePulse from "@/components/LivePulse.vue";
import TripKind from "@/components/TripKind.vue";

const props = defineProps({
  route: { type: Object, default: null },
  reviews: { type: Object, default: () => ({ list: [], count: 0, avg: 0 }) },
  faqs: { type: Array, default: () => [] },
  embedded: { type: Boolean, default: false },
});
defineEmits(["fav", "share", "open-schedule", "open-guide", "open-guides", "open-schedule-create"]);

const previewIndex = ref(null);
const story = computed(() => capStoryImages(props.route?.story || []));
const album = computed(() => storyAlbum(props.route?.gallery || [], story.value).slice(0, 6));
const nextTrip = computed(() => (props.route?.schedules || [])[0] || null);
const stats = computed(() => {
  const route = props.route;
  if (!route) return [];
  const out = [];
  if (route.days) out.push({ label: "天数", value: `${route.days}日` });
  if (route.difficulty) out.push({ label: "难度", value: route.difficulty });
  if (Number(route.distanceKm) > 0) out.push({ label: "里程", value: `${route.distanceKm} 公里` });
  if (route.season) out.push({ label: "季节", value: route.season });
  return out;
});
const jumps = computed(() => {
  const route = props.route;
  if (!route) return [];
  const list = [];
  if (story.value.length || route.description) list.push({ id: "sec-intro", label: "介绍" });
  if (route.itinerary?.length) list.push({ id: "sec-itin", label: "行程" });
  if (route.feeInclude || route.feeExclude || route.notices) list.push({ id: "sec-fee", label: "费用" });
  if (album.value.length) list.push({ id: "sec-photos", label: "相册" });
  if (!props.embedded) list.push({ id: "sec-go", label: "排期" });
  return list.length > 1 ? list : [];
});

function capStoryImages(blocks) {
  let images = 0;
  const out = [];
  for (const block of blocks) {
    if (block?.type === "image") {
      if (images >= 6) continue;
      images += 1;
    }
    out.push(block);
  }
  return out;
}
const refundPolicy = computed(() => props.route?.refundPolicy || null);
const previewList = computed(() => {
  if (!props.route) return [];
  const fromStory = story.value.filter((b) => b.type === "image" && b.url).map((b) => b.url);
  const fromItin = (props.route.itinerary || []).map((it) => it.photo).filter(Boolean);
  const list = [props.route.cover, ...fromStory, ...(props.route.gallery || []), ...fromItin].filter(Boolean);
  return [...new Set(list)];
});

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
function onKey(e) {
  if (previewIndex.value == null) return;
  if (e.key === "Escape") previewIndex.value = null;
  if (e.key === "ArrowLeft") prev();
  if (e.key === "ArrowRight") next();
}
function previewUrl(url) {
  const idx = previewList.value.indexOf(url);
  previewIndex.value = idx >= 0 ? idx : 0;
}
function prev() {
  const n = previewList.value.length;
  if (!n) return;
  previewIndex.value = (previewIndex.value + n - 1) % n;
}
function next() {
  const n = previewList.value.length;
  if (!n) return;
  previewIndex.value = (previewIndex.value + 1) % n;
}
function goSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<style scoped>
.rp-title { margin: 0; font-size: calc(20px * var(--ui-scale)); }
.rp-sub { margin: 4px 0 0; }
.rp-hero {
  position: relative;
  height: 232px;
  margin: 0 -14px 12px;
  cursor: zoom-in;
  overflow: hidden;
}
.rp-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rp-hero-copy {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 48px 16px 14px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.66));
  color: #fff;
}
.rp-hero-copy h2 { margin: 0; font-size: calc(22px * var(--ui-scale)); color: #fff; }
.rp-hero-copy p { margin: 4px 0 0; font-size: calc(13px * var(--ui-scale)); color: rgba(255, 255, 255, 0.9); }
.rp-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  gap: 8px;
  margin: 10px 0;
}
.rp-stat {
  background: var(--paper);
  border-radius: 12px;
  padding: 8px 4px;
  text-align: center;
  box-shadow: var(--shadow);
}
.rp-stat b { display: block; font-size: calc(14px * var(--ui-scale)); line-height: 1.3; }
.rp-stat span { color: var(--muted); font-size: calc(11px * var(--ui-scale)); }
.rp-region { margin: 0 0 6px; }
.rp-next {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: baseline;
  margin: 10px 0;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--paper);
  box-shadow: var(--shadow);
  font-size: calc(13px * var(--ui-scale));
}
.rp-next b { color: var(--leaf); }
.rp-price { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 10px 0; }
.rp-jump {
  position: sticky;
  top: -12px;
  z-index: 3;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin: -4px -14px 8px;
  padding: 16px 14px 8px;
  background: var(--cream);
  scrollbar-width: none;
}
.rp-jump::-webkit-scrollbar { display: none; }
.rp-jump button {
  flex: none;
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--ink);
  border-radius: 999px;
  padding: 6px 12px;
  font: inherit;
  font-size: calc(13px * var(--ui-scale));
  cursor: pointer;
}
.rp-anchor { scroll-margin-top: 64px; }
.rp-hl { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rp-hl-item {
  background: var(--paper);
  border-radius: 12px;
  padding: 10px;
  box-shadow: var(--shadow);
  font-size: calc(13px * var(--ui-scale));
  line-height: 1.45;
}
.rp-hl-item i {
  display: inline-flex;
  width: 18px;
  height: 18px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--mint);
  color: var(--forest);
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  align-items: center;
  justify-content: center;
  vertical-align: 1px;
}
.rp-desc { margin: 0; white-space: pre-wrap; line-height: 1.7; }
.rp-stop { display: grid; grid-template-columns: 14px 1fr; gap: 10px; }
.rp-stop + .rp-stop { margin-top: 12px; }
.rp-rail { position: relative; }
.rp-rail::before {
  content: "";
  position: absolute;
  left: 5px;
  top: 14px;
  bottom: -16px;
  width: 2px;
  background: var(--mint);
}
.rp-stop:last-child .rp-rail::before { display: none; }
.rp-rail i {
  display: block;
  width: 12px;
  height: 12px;
  margin-top: 4px;
  border-radius: 50%;
  background: var(--leaf);
  position: relative;
  z-index: 1;
}
.rp-stop-main { display: flex; gap: 8px; align-items: flex-start; min-width: 0; }
.rp-stop-copy { flex: 1; min-width: 0; }
.rp-stop-copy .time { color: var(--leaf); font-size: calc(12px * var(--ui-scale)); font-weight: 600; }
.rp-stop-photo {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 10px;
  flex: none;
  cursor: zoom-in;
}
.rp-tiers { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.rp-tiers::-webkit-scrollbar { display: none; }
.rp-tier {
  flex: 0 0 128px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--paper);
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: var(--shadow);
  font-size: calc(12px * var(--ui-scale));
  color: var(--muted);
}
.rp-tier strong { color: var(--clay); font-size: calc(18px * var(--ui-scale)); }
.rp-tier-note { margin: 8px 0 0; }
.rp-buses { display: flex; flex-direction: column; gap: 8px; }
.rp-bus {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: baseline;
  background: var(--paper);
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: var(--shadow);
}
.rp-fees { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rp-fees.single { grid-template-columns: 1fr; }
.rp-fee {
  background: var(--paper);
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: var(--shadow);
}
.rp-fee b { display: block; margin-bottom: 4px; color: var(--leaf); font-size: calc(12px * var(--ui-scale)); }
.rp-fee p { margin: 0; font-size: calc(13px * var(--ui-scale)); line-height: 1.5; }
.rp-note {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(201, 162, 74, 0.14);
  font-size: calc(13px * var(--ui-scale));
  line-height: 1.5;
}
.rp-album { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
.rp-album::-webkit-scrollbar { display: none; }
.rp-album img,
.rp-album-one {
  border-radius: 12px;
  object-fit: cover;
  cursor: zoom-in;
  display: block;
}
.rp-album img { flex: 0 0 46%; height: 120px; }
.rp-album-one { width: 100%; height: 180px; }
.rp-refund { margin: 6px 0 0; }
.rp-packs { display: flex; flex-wrap: wrap; gap: 8px; }
.rp-packs span {
  background: var(--mint);
  color: var(--forest);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: calc(12px * var(--ui-scale));
}
.rp-actions { display: flex; gap: 8px; margin-top: 12px; }
.rp-actions .btn { flex: 1; }
</style>
