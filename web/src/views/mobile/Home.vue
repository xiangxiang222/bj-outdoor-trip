<template>
  <div>
    <div class="home-hero">
      <div class="home-kicker">说走就走的京郊山野</div>
      <div class="home-lead">先看出发日期加入拼团，或按天数、目的地去挑线路。</div>
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
    <div class="cal">
      <div class="cal-day" :class="{ on: d.count }" v-for="d in calendar" :key="d.date" @click="goDay(d)">
        <span class="n">{{ d.label }}</span>
        <span class="muted">{{ d.count ? d.count + " 团" : "—" }}</span>
      </div>
    </div>

    <div class="home-grid">
      <button class="home-tile" type="button" v-for="d in durations" :key="d.n" @click="goRoutes({ days: d.n })">
        <strong>{{ d.n }} 日</strong>
        <span>{{ d.hint }}</span>
      </button>
    </div>

    <div class="h2">想去哪</div>
    <div class="chips">
      <div class="chip" v-for="c in places" :key="c" @click="goRoutes({ category: c })">{{ c }}</div>
    </div>

    <div class="banner" v-if="theme" @click="$router.push('/m/route/' + theme.id)">
      <img :src="theme.cover" :alt="theme.title" />
      <div class="cap">
        <div style="font-size:12px;opacity:.9">本周主题 · {{ theme.days }}日 · {{ theme.region }}</div>
        <div style="font-size:18px;font-weight:700">{{ theme.title }}</div>
      </div>
    </div>

    <div class="row" style="margin:16px 0 8px">
      <div class="h2" style="margin:0">正在拼团</div>
      <router-link to="/m/chain" class="muted">全部拼团</router-link>
    </div>
    <div class="card" v-for="s in groups" :key="s.id" @click="$router.push('/m/schedule/' + s.id)">
      <div class="pad">
        <div class="row">
          <strong>{{ s.route?.title }}</strong>
          <span class="tag">{{ s.startDate }}</span>
        </div>
        <div class="muted" style="margin:6px 0">{{ s.organizerType === "company" ? s.companyName : s.organizerName }} · 余 {{ s.remain }} 座<template v-if="s.guaranteed"> · 铁定出发</template></div>
        <div class="progress"><i :style="{ width: Math.min(100, ((s.enrolled || 0) / (s.maxSeats || 1)) * 100) + '%' }"></i></div>
        <div class="row" style="margin-top:8px">
          <span class="muted">{{ s.enrolled }}/{{ s.maxSeats }} · 成团 {{ s.minGroupSize }}</span>
          <span class="price">¥{{ s.quote?.price }}</span>
        </div>
      </div>
    </div>
    <div v-if="!groups.length" class="card"><div class="pad">
      <p class="muted" style="margin:0 0 10px">暂时没有招募中的团，可以选一条线路自己开团。</p>
      <button class="btn ghost block" type="button" @click="goRoutes({})">去选线路开团</button>
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
        <div class="price" style="margin-top:6px">¥{{ r.fromPrice }} <small>起</small></div>
      </div>
    </div>

    <div class="home-member" @click="goMember">
      <strong>{{ store.profile?.isMember ? "会员中心" : "开通会员" }}</strong>
      <span>{{ store.profile?.isMember ? "本线路自动按会员价报价" : "年费 199 元，线路约 92 折，积分加速" }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";

const router = useRouter();
const store = useUserStore();
const list = ref([]);
const schedules = ref([]);
const upcoming = ref([]);
const durations = [
  { n: 1, hint: "当天往返" },
  { n: 2, hint: "过夜一晚" },
  { n: 3, hint: "小长假" },
  { n: 5, hint: "深度出省" },
];
const places = ["长城", "玩水", "登山", "山水", "文化", "草原", "海滨"];

const theme = computed(() => list.value.find((r) => r.days === 3) || list.value.find((r) => r.days === 2) || list.value[0]);
const weekend = computed(() => list.value.filter((r) => r.days === 1).slice(0, 4));
const groups = computed(() =>
  schedules.value.filter((s) => s.status !== "cancelled" && Number(s.remain) > 0).slice(0, 4)
);
const calendar = computed(() => {
  const days = [];
  const now = new Date();
  for (let i = 0; i < 10; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const count = schedules.value.filter((s) => s.startDate === key && s.status !== "cancelled").length;
    days.push({ date: key, label: `${d.getMonth() + 1}/${d.getDate()}`, count });
  }
  return days;
});

onMounted(async () => {
  const [routesRes, schRes] = await Promise.all([http.get("/routes"), http.get("/schedules").catch(() => ({ data: [] }))]);
  list.value = routesRes.data || [];
  schedules.value = schRes.data || [];
  if (store.token) {
    try {
      upcoming.value = (await http.get("/me/trips")).data || [];
    } catch {
      upcoming.value = [];
    }
  }
});

function goRoutes(query) {
  router.push({ path: "/m/routes", query });
}
function goDay(d) {
  if (!d.count) return;
  const hit = schedules.value.find((s) => s.startDate === d.date && s.status !== "cancelled");
  if (hit) router.push("/m/schedule/" + hit.id);
  else router.push("/m/chain");
}

function goMember() {
  if (!store.token) {
    router.push({ path: "/m/login", query: { redirect: "/m/member" } });
    return;
  }
  router.push("/m/member");
}
</script>
