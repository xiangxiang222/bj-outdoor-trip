<template>
  <div>
    <div class="card tap" v-for="r in list" :key="r.id" @click="router.push('/m/route/' + r.id)">
      <img v-if="r.cover" class="cover" :src="r.cover" :alt="r.title" />
      <div class="pad">
        <div class="row"><strong>{{ r.title }}</strong><span class="tag">{{ r.days }}日</span></div>
        <div class="muted">{{ r.region }} · {{ r.seenAt }}</div>
      </div>
    </div>
    <p v-if="!list.length" class="muted">还没有看过的线路。打开一条线路后会出现在这里。</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const list = ref([]);
onMounted(async () => {
  if (!requireLogin(store, router, route)) return;
  list.value = (await http.get("/me/views")).data || [];
});
</script>
