<template>
  <div v-if="r">
    <RouteProfile
      :route="r"
      :weather="weather"
      :reviews="reviews"
      :faqs="faqs"
      @fav="fav"
      @share="share"
      @open-schedule="(id) => $router.push('/m/schedule/' + id)"
      @open-guide="(id) => $router.push('/m/guide/' + id)"
      @open-guides="$router.push('/m/guides')"
      @open-schedule-create="$router.push('/m/open/' + r.id)"
    />
    <p v-if="copied" class="muted" style="text-align:center">链接已复制，可发到微信好友 / 群 / 朋友圈</p>
    <p v-if="favMsg" class="muted" style="text-align:center">{{ favMsg }}</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import RouteProfile from "@/components/RouteProfile.vue";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";

const pageRoute = useRoute();
const router = useRouter();
const store = useUserStore();
const r = ref(null);
const weather = ref(null);
const reviews = ref({ list: [], count: 0, avg: 0 });
const faqs = ref([]);
const copied = ref(false);
const favMsg = ref("");

onMounted(async () => {
  r.value = (await http.get("/routes/" + pageRoute.params.id)).data;
  try {
    weather.value = (await http.get("/weather", { params: { region: r.value.region } })).data;
  } catch {
    weather.value = null;
  }
  try {
    reviews.value = (await http.get("/routes/" + pageRoute.params.id + "/reviews")).data;
  } catch {
    reviews.value = { list: [], count: 0, avg: 0 };
  }
  try {
    faqs.value = ((await http.get("/meta")).data || {}).faqs || [];
  } catch {
    faqs.value = [];
  }
});

async function fav() {
  favMsg.value = "";
  if (!store.token) return router.push({ path: "/m/login", query: { redirect: pageRoute.fullPath } });
  try {
    if (r.value.favored) await http.delete("/favorites/" + r.value.id);
    else await http.post("/favorites/" + r.value.id);
    r.value.favored = !r.value.favored;
  } catch (e) {
    if (/登录/.test(e.message || "")) {
      router.push({ path: "/m/login", query: { redirect: pageRoute.fullPath } });
      return;
    }
    favMsg.value = e.message || "收藏失败";
  }
}

async function share() {
  const url = location.origin + "/m/route/" + r.value.id;
  const text = `【同行者众】${r.value.title}，北京周边${r.value.days}日游，最低 ¥${r.value.priceTiers[0].price} 起，点击报名：${url}`;
  try {
    if (navigator.share) await navigator.share({ title: r.value.title, text, url });
    else {
      await navigator.clipboard.writeText(text);
      copied.value = true;
    }
  } catch {
    await navigator.clipboard.writeText(text);
    copied.value = true;
  }
}
</script>
