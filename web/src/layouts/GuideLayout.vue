<template>
  <div class="mp-phone">
    <div class="mp-status">
      <span>北野行导游端</span>
      <span class="mp-capsule">带团工作台</span>
    </div>
    <div class="mp-nav">
      <button v-if="showBack" class="nav-back" type="button" aria-label="返回" @click="$router.back()">‹</button>
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
import { useRoute } from "vue-router";
const route = useRoute();
const showBack = computed(() => route.name === "guide-schedule");
const title = computed(() => (route.name === "guide-schedule" ? "带团详情" : "我的行程"));
</script>
