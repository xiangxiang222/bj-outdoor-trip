<template>
  <div class="mp-phone">
    <div class="mp-status">
      <span>北野行</span>
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
      <router-link to="/m/official" :class="{ active: $route.path.startsWith('/m/official') }"><span class="ico">☎</span>官方</router-link>
      <router-link to="/m/rules" :class="{ active: $route.path.startsWith('/m/rules') }"><span class="ico">☰</span>规则</router-link>
      <router-link to="/m/mine" :class="{ active: $route.path.startsWith('/m/mine') || $route.path.startsWith('/m/login') || $route.path.startsWith('/m/orders') || $route.path.startsWith('/m/member') || $route.path.startsWith('/m/favorites') }"><span class="ico">☺</span>我的</router-link>
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

const tabNames = new Set(["home", "official", "rules", "mine"]);
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
    home: "北野行",
    official: "官方",
    rules: "规则",
    routes: "线路列表",
    route: "线路详情",
    schedule: "活动报名",
    enroll: "报名",
    coupon: "优惠券",
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
  return map[route.name] || "北野行";
});
const subtitle = computed(() => "北京周边 1 / 2 / 3 / 多日短途游");
</script>
