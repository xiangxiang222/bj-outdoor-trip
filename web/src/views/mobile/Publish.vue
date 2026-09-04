<template>
  <div>
    <p class="muted">提交后需管理员审核。规则见「官方」页。可按关键词先匹配已有线路。</p>
    <label>类型</label>
    <select class="select" v-model="form.channel">
      <option value="trip">户外线路（上首页）</option>
      <option value="activity">其它活动（上活动页）</option>
    </select>
    <label>匹配已有线路</label>
    <input class="input" v-model="keyword" placeholder="输入关键词，点下方选用" @input="searchRoutes" />
    <div class="chips" v-if="hits.length">
      <div class="chip" v-for="r in hits" :key="r.id" @click="applyMatchedRoute(r)">{{ r.title }}</div>
    </div>
    <label>线路标题</label>
    <input class="input" v-model="form.title" placeholder="例如：慕田峪长城一日" />
    <label>副标题</label>
    <input class="input" v-model="form.subtitle" />
    <label>封面</label>
    <input class="input" type="file" accept="image/*" @change="onCover" />
    <img v-if="form.cover" :src="form.cover" alt="" class="cover-preview" />
    <label>天数</label>
    <select class="select" v-model="form.days">
      <option :value="1">1 日</option>
      <option :value="2">2 日</option>
      <option :value="3">3 日</option>
      <option value="multi">多日</option>
    </select>
    <label>城市</label>
    <input class="input" v-model="form.city" placeholder="随发团自动出现在首页" />
    <label>想怎么玩</label>
    <div class="chips">
      <div
        class="play-tag"
        v-for="t in tags"
        :key="t.id"
        :class="{ on: form.playTagIds.includes(t.id) }"
        :style="{ background: t.color, opacity: form.playTagIds.includes(t.id) ? 1 : 0.45 }"
        @click="toggleTag(t.id)"
      >{{ t.name }}</div>
    </div>
    <label>团型</label>
    <select class="select" v-model="form.offerType">
      <option v-for="o in offers" :key="o.key" :value="o.key">{{ o.label }}</option>
    </select>
    <label>原价（元）</label>
    <input class="input" type="number" v-model.number="form.originPrice" />
    <label class="check-row"><input type="checkbox" v-model="form.memberPriceOn" /> 适用会员价</label>
    <label class="check-row"><input type="checkbox" v-model="form.studentPriceOn" /> 适用学生价</label>
    <label v-if="form.offerType !== 'free'">现价（可空，早鸟/特惠将按折扣算）</label>
    <input v-if="form.offerType !== 'free'" class="input" type="number" v-model.number="form.offerPrice" />
    <label>出发日期</label>
    <input class="input" type="date" v-model="form.startDate" />
    <label>组织类型</label>
    <select class="select" v-model="form.organizerType">
      <option value="individual">个人开团</option>
      <option value="company">公司开团</option>
    </select>
    <label v-if="form.organizerType === 'company'">公司名称</label>
    <input v-if="form.organizerType === 'company'" class="input" v-model="form.companyName" />
    <label>大巴车型</label>
    <select class="select" v-model="form.busTypeId">
      <option v-for="b in buses" :key="b.id" :value="b.id">{{ b.name }}（{{ b.seats }}座）</option>
    </select>
    <label>最低成团人数</label>
    <input class="input" type="number" v-model.number="form.minGroupSize" />
    <label>集合点</label>
    <select class="select" v-model="form.meetupPoint">
      <option v-for="m in meetups" :key="m" :value="m">{{ m }}</option>
    </select>
    <label>集合时间</label>
    <input class="input" v-model="form.meetupTime" />
    <label>介绍</label>
    <textarea class="input" v-model="form.description" rows="4" />
    <label>备注</label>
    <textarea class="input" v-model="form.notes" rows="2" />
    <p v-if="err" style="color:var(--clay)">{{ err }}</p>
    <button class="btn block" :disabled="loading" @click="submit">{{ loading ? "提交中…" : "提交审核" }}</button>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { OFFER_TYPES } from "@/utils/offer";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const tags = ref([]);
const buses = ref([]);
const err = ref("");
const loading = ref(false);
const offers = OFFER_TYPES;
const meetups = ["东直门东方银座C口", "西直门凯德mall北门外", "国贸桥下大巴停靠点", "丽泽桥西南角"];
const keyword = ref("");
const hits = ref([]);
const form = ref({
  title: "",
  subtitle: "",
  cover: "",
  channel: route.query.channel === "activity" ? "activity" : "trip",
  days: 1,
  city: "",
  playTagIds: [],
  offerType: "full",
  originPrice: 199,
  offerPrice: null,
  memberPriceOn: true,
  studentPriceOn: true,
  startDate: route.query.date || "",
  organizerType: "individual",
  companyName: store.profile?.companyName || "",
  busTypeId: "",
  minGroupSize: 10,
  meetupPoint: meetups[0],
  meetupTime: "07:30",
  description: "",
  notes: "",
});

onMounted(async () => {
  if (!requireLogin(store, router, route)) return;
  const [tagRes, busRes] = await Promise.all([http.get("/play-tags"), http.get("/buses")]);
  tags.value = tagRes.data || [];
  buses.value = busRes.data || [];
  form.value.busTypeId = buses.value[0]?.id || "";
});

async function searchRoutes() {
  const q = keyword.value.trim();
  if (!q) {
    hits.value = [];
    return;
  }
  try {
    hits.value = ((await http.get("/routes", { params: { q } })).data || []).slice(0, 8);
  } catch {
    hits.value = [];
  }
}
function applyMatchedRoute(r) {
  form.value.title = r.title || form.value.title;
  form.value.subtitle = r.subtitle || "";
  form.value.cover = r.cover || "";
  form.value.days = r.days || 1;
  form.value.city = r.region || form.value.city;
  form.value.originPrice = r.fromPrice || form.value.originPrice;
  keyword.value = r.title;
  hits.value = [];
}
function toggleTag(id) {
  const ids = form.value.playTagIds;
  form.value.playTagIds = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

async function onCover(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const data = new FormData();
  data.append("file", file);
  try {
    const res = await http.post("/upload", data);
    form.value.cover = res.data.url;
  } catch (ex) {
    err.value = ex.message;
  }
}

async function submit() {
  err.value = "";
  loading.value = true;
  try {
    const res = await http.post("/trips", form.value);
    router.push("/m/schedule/" + res.data.id);
  } catch (e) {
    err.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.cover-preview { width: 100%; height: 140px; object-fit: cover; border-radius: 12px; margin-bottom: 8px; }
</style>
