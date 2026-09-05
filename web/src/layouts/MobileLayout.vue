<template>
  <div class="mp-phone">
    <div class="mp-status" :class="{ 'is-home': isHome }">
      <router-link to="/m" class="brand-lockup" aria-label="同行者众 首页">
        <span class="brand-mark-frame" aria-hidden="true">
          <img src="/brand/mark.png" alt="" />
        </span>
        <span class="brand-type">
          <span class="brand-name">同行者众</span>
          <span v-if="isHome" class="brand-tagline">在山野，遇见爱</span>
        </span>
      </router-link>
      <span class="mp-capsule">微信小程序演示</span>
    </div>
    <div v-if="!isHome" class="mp-nav">
      <button v-if="showBack" class="nav-back" type="button" aria-label="返回" @click="goBack">‹</button>
      <div>
        <h1>{{ title }}</h1>
        <div class="sub">{{ subtitle }}</div>
      </div>
    </div>
    <div class="mp-body">
      <router-view />
    </div>
    <nav class="mp-tab">
      <router-link to="/m" :class="{ active: $route.path === '/m' }">
        <svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" /></svg>
        首页
      </router-link>
      <router-link to="/m/activities" :class="{ active: $route.path.startsWith('/m/activities') }">
        <svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v3H8V4Zm-3 5h14v11H5V9Zm3 3h3v3H8v-3Z" /></svg>
        活动
      </router-link>
      <router-link to="/m/orders" :class="{ active: $route.path.startsWith('/m/orders') }">
        <svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h2v2h6V3h2v2h3v16H4V5h3V3zm12 6H5v12h14V9ZM8 12h3v3H8v-3Zm5 0h3v3h-3v-3Z" /></svg>
        行程
      </router-link>
      <router-link to="/m/mine" :class="{ active: mineActive }">
        <svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z" /></svg>
        我的
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";
import { chromeTitle, chromeSubtitle, clearChrome } from "@/utils/pageChrome";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
onMounted(() => store.fetchMeta());
watch(() => route.path, () => clearChrome());

const tabNames = new Set(["home", "activities", "orders", "mine"]);
const isHome = computed(() => route.name === "home");
const showBack = computed(() => !tabNames.has(route.name));
const mineActive = computed(() =>
  ["/m/mine", "/m/login", "/m/member", "/m/favorites", "/m/student", "/m/group", "/m/official", "/m/feedback"].some(
    (p) => route.path === p || route.path.startsWith(p + "/")
  )
);

function goBack() {
  if (route.name === "login") {
    router.replace("/m/mine");
    return;
  }
  if (window.history.length > 1) router.back();
  else router.replace("/m/mine");
}

const title = computed(() => {
  const map = {
    home: "同行者众",
    activities: "同城局",
    official: "客服与规则",
    rules: "客服与规则",
    student: "学生认证",
    group: "团体认证",
    feedback: "建议与 BUG",
    lottery: "抽奖",
    after: "完成活动",
    routes: "线路列表",
    route: "线路详情",
    schedule: "详情",
    enroll: "报名",
    coupon: "优惠券",
    coupons: "我的优惠券",
    open: "发布排期",
    chain: "进行中的团",
    mine: "我的",
    login: "登录 / 注册",
    member: "会员中心",
    orders: "行程",
    favorites: "我的收藏",
    stats: "本团画像",
    guides: "领队导游",
    guide: "导游详情",
    user: "个人主页",
    publish: "发布",
  };
  return chromeTitle.value || map[route.name] || "同行者众";
});
const subtitle = computed(() => {
  const map = {
    home: "在山野，遇见爱",
    activities: "掼蛋、跑步、看电影，户外请走首页",
    official: "加微信、看规则、找客服",
    rules: "加微信、看规则、找客服",
    student: "认证后可走学生价",
    mine: "账号、权益与客服",
    orders: "下一趟，以及走过的局",
    publish: "提交后需管理员审核",
  };
  return chromeSubtitle.value || map[route.name] || "在山野，遇见爱";
});
</script>
