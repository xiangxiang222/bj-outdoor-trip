<template>
  <div class="guide-home">
    <section class="guide-greeting">
      <div class="guide-greeting-top">
        <div><span class="ops-eyebrow">TRIPS LED WITH CARE</span><h2>{{ me.name || "导游" }}，今天辛苦了。</h2><p>{{ me.specialties || "把每一段山野，都变成一段放心的旅程。" }}</p></div>
        <button class="guide-logout" type="button" aria-label="退出登录" @click="out"><OperationsIcon name="logout" /></button>
      </div>
      <div class="guide-counts"><div><strong>{{ list.length }}</strong><span>分配给你的行程</span></div><div><strong>{{ activeCount }}</strong><span>待服务行程</span></div><div><strong>{{ todayCount }}</strong><span>今日集合</span></div></div>
    </section>
    <div class="guide-tabs" role="tablist" aria-label="行程筛选">
      <button v-for="tab in tabs" :key="tab.key" type="button" role="tab" :aria-selected="selected === tab.key" :class="{ on: selected === tab.key }" @click="selected = tab.key">{{ tab.label }}<small>{{ tabCount(tab.key) }}</small></button>
    </div>
    <p v-if="error" class="guide-message" role="alert">{{ error }} <button type="button" @click="load">重新加载</button></p>
    <template v-if="loading"><LoadRow /><LoadRow /></template>
    <template v-else-if="visibleList.length">
      <router-link v-for="s in visibleList" :key="s.id" class="guide-trip-card" :to="'/g/schedule/' + s.id">
        <div class="guide-trip-date"><span><OperationsIcon name="calendar" />{{ s.startDate }}<template v-if="s.endDate && s.endDate !== s.startDate"> — {{ s.endDate }}</template></span><span class="guide-trip-status" :class="{ active: s.startedAt }">{{ tripStatus(s) }}</span></div>
        <div class="guide-trip-content">
          <img v-if="s.route?.cover" class="guide-trip-cover" :src="s.route.cover" :alt="s.route.title" />
          <div v-else class="guide-trip-cover guide-trip-placeholder"><OperationsIcon name="mountain" /></div>
          <div class="guide-trip-info"><h3>{{ s.route?.title || "山野行程" }}</h3><p><OperationsIcon name="pin" />{{ s.meetupPoint || "集合地点待确认" }}<template v-if="s.meetupTime"> · {{ s.meetupTime }}</template></p><p><OperationsIcon name="bus" />{{ s.bus?.name || "车型待确认" }}<template v-if="s.bus?.seats"> · {{ s.bus.seats }} 座</template></p></div>
          <OperationsIcon name="chevron" />
        </div>
        <div class="guide-trip-bottom"><span>集合准备 · 核对出行名单</span><span><strong>{{ s.enrolled || 0 }}</strong> / {{ s.maxSeats || "–" }} 人</span></div>
      </router-link>
    </template>
    <section v-else class="guide-empty">
      <OperationsIcon :name="selected === 'past' ? 'check' : 'mountain'" />
      <p>{{ emptyTitle }}</p><small>{{ emptyDetail }}</small>
      <router-link v-if="selected !== 'past'" to="/m">浏览最新线路 <OperationsIcon name="arrow" /></router-link>
    </section>
    <p class="guide-footnote">带团信息由平台与运营团队实时同步</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import LoadRow from "@/components/LoadRow.vue";
import OperationsIcon from "@/components/OperationsIcon.vue";
import { isHistoricalGuideTrip } from "@/utils/guideWorkspace";

const router = useRouter();
const me = ref({});
const list = ref([]);
const loading = ref(true);
const error = ref("");
const selected = ref("upcoming");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const isHistory = (s) => isHistoricalGuideTrip(s, today);
const upcoming = computed(() => list.value.filter((s) => !isHistory(s)));
const past = computed(() => list.value.filter(isHistory));
const todayList = computed(() => list.value.filter((s) => s.status !== "cancelled" && String(s.startDate || "").slice(0, 10) === today));
const todayCount = computed(() => todayList.value.length);
const activeCount = computed(() => upcoming.value.length);
const tabs = [{ key: "upcoming", label: "待服务" }, { key: "today", label: "今日集合" }, { key: "past", label: "历史行程" }, { key: "all", label: "全部行程" }];
const visibleList = computed(() => {
  if (selected.value === "upcoming") return upcoming.value;
  if (selected.value === "today") return todayList.value;
  if (selected.value === "past") return past.value;
  return list.value;
});
const emptyTitle = computed(() => selected.value === "past" ? "还没有完成的行程" : selected.value === "today" ? "今天没有安排集合" : "还没有分配的行程");
const emptyDetail = computed(() => selected.value === "today" ? "准备好下一次相遇，新的集合计划会同步在这里。" : "平台成团并分配导游后，线路和集合信息会显示在这里。人数成团后系统将自动匹配。 ");
function tabCount(key) { if (key === "upcoming") return upcoming.value.length; if (key === "today") return todayCount.value; if (key === "past") return past.value.length; return list.value.length; }
function tripStatus(s) { if (s.status === "cancelled") return "已取消"; if (s.completedAt) return "已结束"; if (s.startedAt) return "带团中"; if (String(s.startDate || "").slice(0, 10) === today) return "今日集合"; if (String(s.startDate || "").slice(0, 10) < today) return "历史行程"; return "待出发"; }
onMounted(load);
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [guide, schedules] = await Promise.all([http.get("/guide/me"), http.get("/guide/schedules")]);
    me.value = guide.data || {};
    list.value = schedules.data || [];
  } catch (e) {
    error.value = e.message || "行程暂时未能加载，请重试。";
    if (e.status === 401) out();
  } finally { loading.value = false; }
}
function out() {
  localStorage.removeItem("bj_guide_token");
  localStorage.removeItem("bj_guide_name");
  router.push("/g/login");
}
</script>
