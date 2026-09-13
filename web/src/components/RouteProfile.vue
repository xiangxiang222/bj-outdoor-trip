<template>
  <div v-if="route" class="route-profile">
    <img
      v-if="!embedded && route.cover"
      class="cover"
      :src="route.cover"
      style="width:100%;height:200px;object-fit:cover;border-radius:16px;margin-bottom:8px;cursor:zoom-in"
      @click="previewUrl(route.cover)"
    />
    <LivePulse v-if="!embedded && route.id" scope="route" :route-id="route.id" />
    <div class="row">
      <h2 style="margin:0;font-size:20px">{{ route.title }}</h2>
      <span class="tag" v-if="route.days || route.difficulty">{{ [route.days ? route.days + "日" : "", route.difficulty].filter(Boolean).join(" · ") }}</span>
    </div>
    <p class="muted">{{ route.subtitle }}</p>
    <div>
      <span
        class="play-tag sm"
        v-for="t in route.playTags || route.tags"
        :key="t.id || t"
        :style="{ background: t.color || '#2d6a4f' }"
      >{{ t.name || t }}</span>
    </div>
    <div class="row" style="margin:10px 0">
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

    <div class="h2" v-if="story.length">线路介绍</div>
    <div class="card" v-if="story.length"><div class="pad">
      <RouteStory :blocks="story" @preview="previewUrl" />
    </div></div>
    <div class="card" v-else-if="route.description"><div class="pad">
      <p style="margin-top:0;white-space:pre-wrap">{{ route.description }}</p>
    </div></div>

    <RouteVideos :videos="route.videos || []" />

    <div class="h2" v-if="album.length">更多照片</div>
    <div class="gallery" v-if="album.length">
      <img v-for="g in album" :key="g" :src="g" @click="previewUrl(g)" />
    </div>

    <div class="h2" v-if="route.highlights?.length">亮点</div>
    <div class="card" v-if="route.highlights?.length"><div class="pad">
      <p v-for="(h, i) in route.highlights" :key="i">{{ i + 1 }}. {{ h }}</p>
    </div></div>

    <div class="h2" v-if="route.itinerary?.length">行程安排</div>
    <div class="card" v-if="route.itinerary?.length"><div class="pad timeline">
      <div class="item" v-for="(it, i) in route.itinerary" :key="i">
        <div class="time">{{ it.time }} · {{ it.title }}</div>
        <div class="muted">{{ it.detail }}</div>
        <img v-if="it.photo" class="itin-photo" :src="it.photo" alt="" @click="previewUrl(it.photo)" />
      </div>
    </div></div>

    <div class="h2" v-if="route.priceTiers?.length">人数阶梯价</div>
    <div class="card" v-if="route.priceTiers?.length"><div class="pad">
      <div class="row" v-for="t in route.priceTiers" :key="t.minPeople" style="padding:6px 0;border-bottom:1px dashed var(--line)">
        <span>{{ t.minPeople }} 人起</span>
        <span>¥{{ t.price }} / 会员 ¥{{ t.memberPrice }} / 学生 ¥{{ t.studentPrice }}</span>
      </div>
      <p class="muted">个人或高校开团先报名占座，按当前人数档位计价，出行前付款；公司开团可先上车，结束后按最终人数统一支付。</p>
    </div></div>

    <div class="h2" v-if="route.buses?.length">可选车型</div>
    <div class="card" v-if="route.buses?.length"><div class="pad">
      <div v-for="b in route.buses" :key="b.id" class="row" style="padding:6px 0">
        <span>{{ b.name }}</span><span class="muted">{{ b.seats }} 座 · {{ b.description }}</span>
      </div>
    </div></div>

    <div class="h2" v-if="route.feeInclude || route.feeExclude || route.equipment || route.notices">费用说明</div>
    <div class="card" v-if="route.feeInclude || route.feeExclude || route.equipment || route.notices"><div class="pad">
      <p v-if="route.feeInclude"><strong>含：</strong>{{ route.feeInclude }}</p>
      <p v-if="route.feeExclude"><strong>不含：</strong>{{ route.feeExclude }}</p>
      <p v-if="route.equipment"><strong>装备：</strong>{{ route.equipment }}</p>
      <p v-if="route.notices"><strong>注意：</strong>{{ route.notices }}</p>
    </div></div>

    <template v-if="!embedded">
      <div class="h2">可报名排期</div>
      <div class="card" v-for="s in route.schedules" :key="s.id" @click="$emit('open-schedule', s.id)">
        <div class="pad">
          <div class="row">
            <strong>{{ s.startDate }}{{ s.endDate !== s.startDate ? " 至 " + s.endDate : "" }}</strong>
            <span class="tag">{{ organizerTypeText(s.organizerType) }}</span>
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
          <span class="stars">{{ starText(rv.rating) }}</span>
        </div>
        <p v-if="rv.content">{{ rv.content }}</p>
        <p class="muted">{{ rv.createdAt }}</p>
      </div>
    </div>
    <p class="muted" v-else>还没有评价。报名后可在「我的报名」写下体验。</p>

    <div class="h2">装备清单</div>
    <div class="card"><div class="pad">
      <p v-for="item in (route.packingList || [])" :key="item">· {{ item }}</p>
      <p class="muted" v-if="!route.packingList?.length">{{ route.equipment || "详见装备说明。" }}</p>
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

    <div v-if="!embedded" style="display:flex;gap:8px;margin-top:12px">
      <button class="btn ghost" style="flex:1" type="button" @click="$emit('share')">分享报名</button>
      <button class="btn" style="flex:1" type="button" @click="$emit('open-schedule-create')">发布排期</button>
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
import { organizerTypeText, starText } from "@/utils/labels";
import { storyAlbum } from "@/utils/story";
import TripPrices from "@/components/TripPrices.vue";
import RouteStory from "@/components/RouteStory.vue";
import RouteVideos from "@/components/RouteVideos.vue";
import LivePulse from "@/components/LivePulse.vue";

const props = defineProps({
  route: { type: Object, default: null },
  reviews: { type: Object, default: () => ({ list: [], count: 0, avg: 0 }) },
  faqs: { type: Array, default: () => [] },
  embedded: { type: Boolean, default: false },
});
defineEmits(["fav", "share", "open-schedule", "open-guide", "open-guides", "open-schedule-create"]);

const previewIndex = ref(null);
const story = computed(() => props.route?.story || []);
const album = computed(() => storyAlbum(props.route?.gallery || [], story.value));
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
</script>
