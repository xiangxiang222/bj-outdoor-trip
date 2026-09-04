<template>
  <div class="mp-phone">
    <div class="mp-status">
      <span class="brand-lockup">
        <img class="brand-mark sm" src="/brand/logo.jpg" alt="" />
        同行者众
      </span>
      <span class="mp-capsule">微信小程序演示</span>
    </div>
    <div class="mp-nav">
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
      <router-link to="/m" :class="{ active: $route.path === '/m' }"><span class="ico">⛰</span>首页</router-link>
      <router-link to="/m/activities" :class="{ active: $route.path.startsWith('/m/activities') }"><span class="ico">✦</span>活动</router-link>
      <router-link to="/m/official" :class="{ active: $route.path.startsWith('/m/official') || $route.path.startsWith('/m/rules') }"><span class="ico">☎</span>官方</router-link>
      <router-link to="/m/mine" :class="{ active: $route.path.startsWith('/m/mine') || $route.path.startsWith('/m/login') || $route.path.startsWith('/m/orders') || $route.path.startsWith('/m/member') || $route.path.startsWith('/m/favorites') || $route.path.startsWith('/m/student') || $route.path.startsWith('/m/group') }"><span class="ico">☺</span>我的</router-link>
    </nav>
  </div>
</template>

<script setup>
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
onMounted(() => store.fetchMeta());

const tabNames = new Set(["home", "activities", "official", "rules", "mine"]);
const showBack = computed(() => !tabNames.has(route.name));

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
    activities: "活动",
    official: "官方",
    rules: "官方",
    student: "学生认证",
    group: "团体认证",
    feedback: "建议与 BUG",
    lottery: "抽奖",
    after: "完成活动",
    routes: "线路列表",
    route: "线路详情",
    schedule: "活动报名",
    enroll: "报名",
    coupon: "优惠券",
    coupons: "我的优惠券",
    open: "发布排期",
    chain: "进行中的团",
    mine: "我的",
    login: "登录 / 注册",
    member: "会员中心",
    orders: "我的报名",
    favorites: "我的收藏",
    stats: "本团画像",
    guides: "领队导游",
    guide: "导游详情",
    user: "个人主页",
  };
  return map[route.name] || "同行者众";
});
const subtitle = computed(() => "在山野，遇见爱");
</script>
