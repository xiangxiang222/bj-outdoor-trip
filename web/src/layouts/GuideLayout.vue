<template>
  <div class="guide-shell">
    <header class="guide-topbar">
      <router-link to="/g" class="guide-brand" aria-label="同行者众导游端"><img src="/brand/mark.png" alt="" /><span><strong>同行者众</strong><small>TOGETHER INTO THE WILD</small></span></router-link>
      <span class="guide-role-label">导游工作台</span>
    </header>
    <div class="guide-page-nav">
      <button v-if="showBack" class="guide-back" type="button" aria-label="返回上一页" @click="goBack"><OperationsIcon name="chevron" /></button>
      <div><h1>{{ title }}</h1><p>{{ subtitle }}</p></div>
    </div>
    <main class="guide-body" ref="body"><router-view /></main>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import OperationsIcon from "@/components/OperationsIcon.vue";
import "@/styles/operations.css";
const route = useRoute();
const router = useRouter();
const body = ref();
const showBack = computed(() => route.name === "guide-schedule" || route.name === "guide-traveler");
const title = computed(() => route.name === "guide-traveler" ? "出行人档案" : route.name === "guide-schedule" ? "带团服务" : "我的带团工作台");
const subtitle = computed(() => route.name === "guide-traveler" ? "认真了解每一位同行的伙伴" : route.name === "guide-schedule" ? "集合、签到与行程服务，一目了然" : "照顾好每一次出发，也享受每一程山野");
watch(() => route.fullPath, () => body.value?.scrollTo({ top: 0 }));
function goBack() { router.push(route.name === "guide-traveler" ? "/g/schedule/" + route.params.id : "/g"); }
</script>
