<template>
  <div>
    <div class="card" v-for="p in list" :key="p.id">
      <div class="pad">
        <div class="row">
          <strong @click="router.push('/m/user/' + p.id)">{{ p.nickname }}</strong>
          <button class="btn ghost" type="button" @click="unfollow(p)">取消关注</button>
        </div>
        <p v-if="p.nextTitle" class="muted" style="margin:6px 0 0">下一团 {{ p.nextTitle }} · {{ p.nextDate }}</p>
        <p v-else class="muted" style="margin:6px 0 0">还没有即将出发的团</p>
      </div>
    </div>
    <p v-if="!list.length" class="muted">在别人的主页点「关注」。对方再发团时，消息里会提醒你。</p>
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
  list.value = (await http.get("/me/follows")).data || [];
});
async function unfollow(p) {
  await http.delete("/me/follows/" + p.id);
  list.value = list.value.filter((row) => row.id !== p.id);
}
</script>
