<template>
  <div>
    <div class="card tap" v-for="r in list" :key="r.id" @click="goRoute(r)">
      <img class="cover" :src="r.cover" :alt="r.title" />
      <div class="pad">
        <div class="row"><strong>{{ r.title }}</strong><span class="tag">{{ r.days }}日</span></div>
        <div class="muted">{{ r.subtitle }}</div>
      </div>
    </div>
    <LoadRow v-if="loading" />
    <div v-else-if="!list.length" class="card">
      <div class="pad">
        <p style="margin-top:0">还没有收藏线路，去线路详情点「收藏」即可。</p>
        <p class="muted" style="margin-bottom:0">已经下架的线路不会留在这里。</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import LoadRow from "@/components/LoadRow.vue";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const list = ref([]);
const loading = ref(true);
onMounted(async () => {
  if (!requireLogin(store, router, route)) return;
  try {
    list.value = (await http.get("/favorites")).data || [];
  } finally {
    loading.value = false;
  }
});
function goRoute(r) {
  if (r.id) router.push("/m/route/" + r.id);
}
</script>
