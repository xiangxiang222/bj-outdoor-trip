<template>
  <div v-if="missing" class="route-miss">
    <div class="route-miss-card">
      <div class="route-miss-mark" aria-hidden="true">线</div>
      <h2>找不到这条线路</h2>
      <p>它可能已经下架，或这条链接已经失效。收藏和最近看过里不会再列出下架的线路。</p>
      <button class="btn clay block" type="button" @click="router.push('/m')">去首页看线路</button>
      <button class="btn ghost block" type="button" @click="back">返回</button>
    </div>
  </div>
  <LoadRow v-else-if="!r" />
  <div v-else>
    <div v-if="r.reviewStatus === 'pending'" class="card">
      <div class="pad">
        <p style="margin-top:0;color:var(--leaf)">已提交审核，通过后会出现在线路目录。</p>
        <p class="muted" style="margin-bottom:0">通过后会出现在线路目录。可先加客服微信。</p>
      </div>
    </div>
    <div v-else-if="r.reviewStatus === 'rejected'" class="card">
      <div class="pad">
        <p style="margin-top:0;color:var(--clay)">未通过{{ r.reviewNote ? "：" + r.reviewNote : "" }}</p>
        <button class="btn ghost block" type="button" @click="$router.push('/m/route-apply')">改完再申请</button>
      </div>
    </div>
    <RouteProfile
      :route="r"
      :reviews="reviews"
      :reviews-ready="reviewsReady"
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
import LoadRow from "@/components/LoadRow.vue";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";

const pageRoute = useRoute();
const router = useRouter();
const store = useUserStore();
const r = ref(null);
const missing = ref(false);
const reviews = ref({ list: [], count: 0, avg: 0 });
const reviewsReady = ref(false);
const faqs = ref([]);
const copied = ref(false);
const favMsg = ref("");

onMounted(async () => {
  try {
    r.value = (await http.get("/routes/" + pageRoute.params.id)).data;
  } catch {
    missing.value = true;
    return;
  }
  try {
    reviews.value = (await http.get("/routes/" + pageRoute.params.id + "/reviews")).data;
  } catch {
    reviews.value = { list: [], count: 0, avg: 0 };
  } finally {
    reviewsReady.value = true;
  }
  try {
    faqs.value = ((await http.get("/meta")).data || {}).faqs || [];
  } catch {
    faqs.value = [];
  }
});

function back() {
  if (window.history.length > 1) router.back();
  else router.push("/m");
}

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
