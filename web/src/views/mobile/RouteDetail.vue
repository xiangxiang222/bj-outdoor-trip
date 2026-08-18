<template>
  <div v-if="r">
    <img class="cover" :src="r.cover" style="width:100%;height:200px;object-fit:cover;border-radius:16px;margin-bottom:10px;cursor:zoom-in" @click="preview(0, true)" />
    <div class="row">
      <h2 style="margin:0;font-size:20px">{{ r.title }}</h2>
      <span class="tag">{{ r.days }}日 · {{ r.difficulty }}</span>
    </div>
    <p class="muted">{{ r.subtitle }}</p>
    <div v-if="weather" class="weather" :class="weather.alerts?.[0]?.level">
      <strong>{{ weather.place }} {{ weather.summary }}</strong>
      <span>{{ weather.tmin }}~{{ weather.tmax }}℃</span>
      <p>{{ weather.alerts?.[0]?.text }}</p>
    </div>
    <div><span class="tag" v-for="t in r.tags" :key="t">{{ t }}</span></div>
    <div class="row" style="margin:10px 0">
      <div>
        <div class="price">¥{{ r.priceTiers?.[0]?.price }} <small>起</small></div>
        <div class="muted">会员价 ¥{{ r.priceTiers?.[0]?.memberPrice }} 起</div>
      </div>
      <button class="btn ghost" @click="fav">{{ r.favored ? "已收藏" : "收藏" }}</button>
    </div>

    <div class="h2">线路相册</div>
    <div class="gallery">
      <img v-for="(g, i) in r.gallery" :key="i" :src="g" @click="preview(i, false)" />
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

    <div class="h2">线路介绍</div>
    <div class="card"><div class="pad">{{ r.description }}</div></div>

    <div class="h2">亮点</div>
    <div class="card"><div class="pad">
      <p v-for="(h, i) in r.highlights" :key="i">{{ i + 1 }}. {{ h }}</p>
    </div></div>

    <div class="h2">行程安排</div>
    <div class="card"><div class="pad timeline">
      <div class="item" v-for="(it, i) in r.itinerary" :key="i">
        <div class="time">{{ it.time }} · {{ it.title }}</div>
        <div class="muted">{{ it.detail }}</div>
      </div>
    </div></div>

    <div class="h2">人数阶梯价</div>
    <div class="card"><div class="pad">
      <div class="row" v-for="t in r.priceTiers" :key="t.minPeople" style="padding:6px 0;border-bottom:1px dashed var(--line)">
        <span>{{ t.minPeople }} 人起</span>
        <span>¥{{ t.price }} / 会员 ¥{{ t.memberPrice }}</span>
      </div>
      <p class="muted">个人拼团先报名占座，按当前人数档位计价，出行前付款；公司开团可先上车，结束后按最终人数统一支付。</p>
    </div></div>

    <div class="h2">可选车型</div>
    <div class="card"><div class="pad">
      <div v-for="b in r.buses" :key="b.id" class="row" style="padding:6px 0">
        <span>{{ b.name }}</span><span class="muted">{{ b.seats }} 座 · {{ b.description }}</span>
      </div>
    </div></div>

    <div class="h2">费用说明</div>
    <div class="card"><div class="pad">
      <p><strong>含：</strong>{{ r.feeInclude }}</p>
      <p><strong>不含：</strong>{{ r.feeExclude }}</p>
      <p><strong>装备：</strong>{{ r.equipment }}</p>
      <p><strong>注意：</strong>{{ r.notices }}</p>
    </div></div>

    <div class="h2">可报名排期</div>
    <div class="card" v-for="s in r.schedules" :key="s.id" @click="$router.push('/m/schedule/' + s.id)">
      <div class="pad">
        <div class="row">
          <strong>{{ s.startDate }}{{ s.endDate !== s.startDate ? " 至 " + s.endDate : "" }}</strong>
          <span class="tag">{{ organizerTypeText(s.organizerType) }}</span>
        </div>
        <div class="muted">{{ s.bus?.name }} · {{ s.meetupPoint }} {{ s.meetupTime }}</div>
        <div class="progress"><i :style="{ width: Math.min(100, (s.enrolled / s.maxSeats) * 100) + '%' }"></i></div>
        <div class="row muted"><span>已报 {{ s.enrolled }}/{{ s.maxSeats }} · 成团 {{ s.minGroupSize }} 人</span><span>当前约 ¥{{ s.quote.price }}</span></div>
      </div>
    </div>
    <p class="muted" v-if="!r.schedules?.length">暂无排期，可以自己开一团。</p>

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

    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn ghost" style="flex:1" @click="share">分享报名</button>
      <button class="btn" style="flex:1" @click="$router.push('/m/open/' + r.id)">发布排期</button>
    </div>
    <p v-if="copied" class="muted" style="text-align:center">链接已复制，可发到微信好友 / 群 / 朋友圈</p>
    <p v-if="favMsg" class="muted" style="text-align:center">{{ favMsg }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { organizerTypeText, starText } from "@/utils/labels";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const r = ref(null);
const weather = ref(null);
const reviews = ref({ list: [], count: 0, avg: 0 });
const copied = ref(false);
const favMsg = ref("");
const previewIndex = ref(null);

const previewList = computed(() => {
  if (!r.value) return [];
  const list = [r.value.cover, ...(r.value.gallery || [])].filter(Boolean);
  return [...new Set(list)];
});

onMounted(async () => {
  r.value = (await http.get("/routes/" + route.params.id)).data;
  window.addEventListener("keydown", onKey);
  try {
    weather.value = (await http.get("/weather", { params: { region: r.value.region } })).data;
  } catch {
    weather.value = null;
  }
  try {
    reviews.value = (await http.get("/routes/" + route.params.id + "/reviews")).data;
  } catch {
    reviews.value = { list: [], count: 0, avg: 0 };
  }
});
onUnmounted(() => window.removeEventListener("keydown", onKey));
function onKey(e) {
  if (previewIndex.value == null) return;
  if (e.key === "Escape") previewIndex.value = null;
  if (e.key === "ArrowLeft") prev();
  if (e.key === "ArrowRight") next();
}

function preview(i, fromCover) {
  if (fromCover) previewIndex.value = 0;
  else {
    const url = r.value.gallery[i];
    const idx = previewList.value.indexOf(url);
    previewIndex.value = idx >= 0 ? idx : 0;
  }
}
function prev() {
  const n = previewList.value.length;
  previewIndex.value = (previewIndex.value + n - 1) % n;
}
function next() {
  const n = previewList.value.length;
  previewIndex.value = (previewIndex.value + 1) % n;
}

async function fav() {
  favMsg.value = "";
  if (!store.token) return router.push({ path: "/m/login", query: { redirect: route.fullPath } });
  try {
    if (r.value.favored) await http.delete("/favorites/" + r.value.id);
    else await http.post("/favorites/" + r.value.id);
    r.value.favored = !r.value.favored;
  } catch (e) {
    if (/登录/.test(e.message || "")) {
      router.push({ path: "/m/login", query: { redirect: route.fullPath } });
      return;
    }
    favMsg.value = e.message || "收藏失败";
  }
}

async function share() {
  const url = location.origin + "/m/route/" + r.value.id;
  const text = `【北野行】${r.value.title}，北京周边${r.value.days}日游，最低 ¥${r.value.priceTiers[0].price} 起，点击报名：${url}`;
  try {
    if (navigator.share) await navigator.share({ title: r.value.title, text, url });
    else {
      await navigator.clipboard.writeText(text);
      copied.value = true;
    }
  } catch {
    await navigator.clipboard.writeText(text);
    copied.value = true;
  }
}
</script>
