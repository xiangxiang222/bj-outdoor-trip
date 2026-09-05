<template>
  <div class="mp-phone">
    <div class="mp-status is-home">
      <router-link to="/g" class="brand-lockup" aria-label="同行者众导游端">
        <span class="brand-mark-frame" aria-hidden="true">
          <img src="/brand/mark.png" alt="" />
        </span>
        <span class="brand-type">
          <span class="brand-name">同行者众</span>
          <span class="brand-tagline">导游端</span>
        </span>
      </router-link>
      <span class="mp-capsule">带团工作台</span>
    </div>
    <div class="mp-nav">
      <button v-if="showBack" class="nav-back" type="button" aria-label="返回" @click="goBack">‹</button>
      <div>
        <h1>{{ title }}</h1>
        <div class="sub">集合核销 · 名单 · 天气</div>
      </div>
    </div>
    <div class="mp-body">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
const route = useRoute();
const router = useRouter();
const showBack = computed(() => route.name === "guide-schedule" || route.name === "guide-traveler");
const title = computed(() => {
  if (route.name === "guide-traveler") return "游客详情";
  if (route.name === "guide-schedule") return "带团详情";
  return "我的行程";
});
function goBack() {
  if (route.name === "guide-traveler") {
    router.push("/g/schedule/" + route.params.id);
    return;
  }
  router.push("/g");
}
</script>
