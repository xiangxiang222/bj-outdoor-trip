<template>
  <div>
    <p class="muted">{{ isActivity ? "提交后需管理员审核，通过后出现在活动 Tab。" : "提交后需管理员审核。规则在「我的 → 客服与规则」。可按关键词先匹配已有线路。" }}</p>
    <label>类型</label>
    <select class="select" v-model="form.channel">
      <option value="trip">户外线路（上首页）</option>
      <option value="activity">同城局（上活动 Tab）</option>
    </select>

    <template v-if="isActivity">
      <label>玩法</label>
      <div class="act-kinds">
        <button
          class="act-kind"
          type="button"
          v-for="k in kinds"
          :key="k.key"
          :class="{ on: form.activityKind === k.key }"
          @click="pickKind(k.key)"
        >
          <span>{{ k.emoji }}</span>
          <em>{{ k.label }}</em>
          <small>{{ k.hint }}</small>
        </button>
      </div>
      <label>标题</label>
      <input class="input" v-model="form.title" :placeholder="kindPlaceholder" />
      <label>地点</label>
      <input class="input" v-model="form.meetupPoint" placeholder="例如：三里屯太古里南区" />
      <label>城区</label>
      <input class="input" v-model="form.city" placeholder="朝阳 / 海淀 / 通州" />
      <label>日期</label>
      <input class="input" type="date" v-model="form.startDate" />
      <label>时间</label>
      <input class="input" v-model="form.meetupTime" placeholder="19:30" />
      <label>最少几人成局</label>
      <input class="input" type="number" v-model.number="form.minGroupSize" />
      <label>人数上限</label>
      <input class="input" type="number" v-model.number="form.maxSeats" />
      <label>费用（元，0 为免费）</label>
      <input class="input" type="number" v-model.number="form.originPrice" />
      <label>介绍</label>
      <textarea class="input" v-model="form.description" rows="4" placeholder="带什么、几点开始、怎么找人" />
    </template>

    <template v-else>
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
      <div v-if="form.offerType === 'combo'" class="card"><div class="pad">
        <p class="muted">组合团目前只对学生或已认证的学生组织开放。写下对另一半的要求，报名的人会看到。</p>
        <label>另一半身份</label>
        <select class="select" v-model="form.comboRule.require">
          <option value="student_or_group">学生或学生组织</option>
          <option value="student">仅已认证学生</option>
          <option value="group">仅已认证学生组织</option>
        </select>
        <label>另一半学校（可空）</label>
        <input class="input" v-model="form.comboRule.school" placeholder="例如：北京大学" />
      </div></div>
      <label>原价（元）</label>
      <input class="input" type="number" v-model.number="form.originPrice" />
      <label class="check-row"><input type="checkbox" v-model="form.memberPriceOn" /> 适用会员价</label>
      <label class="check-row"><input type="checkbox" v-model="form.studentPriceOn" /> 适用学生价</label>
      <label class="check-row"><input type="checkbox" v-model="form.studentOnly" /> 仅已认证学生可报名</label>
      <label>限定高校（可空，逗号分隔）</label>
      <input class="input" v-model="form.schools" placeholder="例如：北京大学,清华大学" />
      <p class="muted">填了高校后，只有认证学校匹配的学生能报，未认证或外校会被拦住。</p>
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
    </template>

    <p v-if="err" style="color:var(--clay)">{{ err }}</p>
    <button class="btn block" :disabled="loading" @click="submit">{{ loading ? "提交中…" : "提交审核" }}</button>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { OFFER_TYPES } from "@/utils/offer";
import { ACTIVITY_KINDS } from "@/utils/activityKind";
import { todayYmd } from "@/utils/trips";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const tags = ref([]);
const buses = ref([]);
const err = ref("");
const loading = ref(false);
const offers = OFFER_TYPES;
const meetups = ["东直门东方银座C口", "西直门凯德mall北门外", "国贸桥下大巴停靠点", "丽泽桥西南角"];
const kinds = ACTIVITY_KINDS;
const keyword = ref("");
const hits = ref([]);

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return todayYmd(d);
}

const queryKind = String(route.query.kind || "");
const queryTitle = String(route.query.title || "");
const startAsActivity = route.query.channel === "activity" || kinds.some((k) => k.key === queryTitle || k.key === queryKind);
const form = ref({
  title: queryTitle && !kinds.some((k) => k.key === queryTitle) ? queryTitle : queryKind || queryTitle,
  subtitle: "",
  cover: "",
  channel: startAsActivity ? "activity" : "trip",
  activityKind: kinds.some((k) => k.key === queryKind) ? queryKind : kinds.some((k) => k.key === queryTitle) ? queryTitle : startAsActivity ? "掼蛋" : "",
  days: 1,
  city: startAsActivity ? "朝阳" : "",
  playTagIds: [],
  offerType: startAsActivity ? "free" : "full",
  originPrice: startAsActivity ? 0 : 199,
  offerPrice: null,
  memberPriceOn: true,
  studentPriceOn: true,
  studentOnly: false,
  schools: "",
  startDate: route.query.date || (startAsActivity ? tomorrow() : ""),
  organizerType: "individual",
  companyName: store.profile?.companyName || "",
  busTypeId: "",
  minGroupSize: startAsActivity ? 4 : 10,
  maxSeats: 12,
  meetupPoint: startAsActivity ? "" : meetups[0],
  meetupTime: startAsActivity ? "19:30" : "07:30",
  description: "",
  notes: "",
  comboRule: { require: "student_or_group", school: "" },
});
const isActivity = computed(() => form.value.channel === "activity");
const kindPlaceholder = computed(() => {
  const k = kinds.find((x) => x.key === form.value.activityKind);
  return k ? `例如：周五夜${k.label}` : "给这局起个名字";
});

watch(
  () => form.value.channel,
  (channel) => {
    if (channel === "activity") {
      form.value.offerType = "free";
      form.value.originPrice = 0;
      form.value.minGroupSize = 4;
      form.value.meetupTime = form.value.meetupTime || "19:30";
      form.value.city = form.value.city || "朝阳";
      form.value.startDate = form.value.startDate || tomorrow();
      form.value.activityKind = form.value.activityKind || "掼蛋";
      if (meetups.includes(form.value.meetupPoint)) form.value.meetupPoint = "";
    } else if (!form.value.meetupPoint) {
      form.value.meetupPoint = meetups[0];
      form.value.meetupTime = "07:30";
    }
  }
);

onMounted(async () => {
  if (!requireLogin(store, router, route)) return;
  const [tagRes, busRes] = await Promise.all([http.get("/play-tags"), http.get("/buses")]);
  tags.value = tagRes.data || [];
  buses.value = busRes.data || [];
  form.value.busTypeId = buses.value[0]?.id || "";
});

function pickKind(key) {
  const prev = form.value.activityKind;
  form.value.activityKind = key;
  if (!form.value.title || form.value.title === prev) form.value.title = key;
}

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
    const payload = { ...form.value };
    if (payload.channel === "activity") {
      payload.days = 1;
      payload.offerType = Number(payload.originPrice) > 0 ? payload.offerType || "full" : "free";
      payload.organizerType = "individual";
      if (!String(payload.meetupPoint || "").trim()) {
        err.value = "请填写地点";
        loading.value = false;
        return;
      }
    }
    const res = await http.post("/trips", payload);
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
