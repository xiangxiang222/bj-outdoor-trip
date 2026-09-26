<template>
  <div>
    <div class="row" style="margin-bottom:8px" v-if="list.length">
      <span class="muted">{{ unread ? unread + " 条未读" : "都读过了" }}</span>
      <button v-if="unread" class="btn ghost" type="button" @click="readAll">全部已读</button>
    </div>
    <button class="card cell" v-for="n in list" :key="n.id" type="button" @click="open(n)">
      <span>
        <strong>{{ n.title }}</strong>
        <small class="muted" style="display:block;margin-top:4px">{{ n.body }}</small>
        <small class="muted">{{ n.createdAt }}</small>
      </span>
      <i>{{ n.unread ? "未读" : "" }}</i>
    </button>
    <p v-if="!list.length" class="muted">成团、集合点变更、审核结果和退款到账会出现在这里。</p>
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
const unread = ref(0);

onMounted(load);

async function load() {
  if (!requireLogin(store, router, route)) return;
  const res = await http.get("/me/notices");
  list.value = res.data || [];
  unread.value = res.unread || 0;
}

async function readAll() {
  const res = await http.post("/me/notices/read-all");
  list.value = res.data || [];
  unread.value = 0;
}

async function open(n) {
  await http.post("/me/notices/" + n.id + "/read").catch(() => {});
  n.unread = false;
  unread.value = list.value.filter((row) => row.unread).length;
  if (n.href && n.href.startsWith("/m/")) router.push(n.href);
}
</script>
