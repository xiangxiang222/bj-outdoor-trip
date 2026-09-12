<template>
  <div>
    <p class="muted">个人通过领队申请后，才能在团详情页报名领队。公司账号通过后角色仍是公司，同时具备领队资格。</p>
    <p v-if="store.profile?.isLeader" style="color:var(--leaf)">已是领队{{ store.profile.leaderName ? " · " + store.profile.leaderName : "" }}</p>
    <p v-else-if="store.profile?.leaderStatus === 'pending'" class="muted">审核中{{ store.profile.leaderName ? " · " + store.profile.leaderName : "" }}</p>
    <p v-else-if="store.profile?.leaderStatus === 'rejected'" class="muted">上次未通过，可修改后再次提交。</p>
    <label>真实姓名</label>
    <input class="input" v-model="name" placeholder="带队时展示给团友" :disabled="certified" />
    <label>带队年限</label>
    <input class="input" type="number" min="0" max="40" v-model.number="years" placeholder="没有带过可填 0" :disabled="certified" />
    <label>带队经历</label>
    <textarea class="input" rows="4" v-model="intro" placeholder="走过哪些线、怎么带队、能照顾到什么" :disabled="certified"></textarea>
    <p v-if="msg" :style="ok ? 'color:var(--leaf)' : 'color:var(--clay)'">{{ msg }}</p>
    <button class="btn block" type="button" :disabled="loading || certified" @click="submit">{{ loading ? "提交中…" : "提交申请" }}</button>
    <button v-if="backPath" class="btn ghost block" type="button" style="margin-top:8px" @click="goBack">返回团详情</button>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const name = ref(store.profile?.leaderName || store.profile?.nickname || "");
const years = ref(Number(store.profile?.leaderYears || 0));
const intro = ref(store.profile?.leaderIntro || "");
const msg = ref("");
const ok = ref(false);
const loading = ref(false);
const certified = computed(() => !!store.profile?.isLeader);
const backPath = computed(() => {
  const raw = String(route.query.redirect || "");
  return raw.startsWith("/m/") ? raw : "";
});

async function submit() {
  if (!requireLogin(store, router, route)) return;
  loading.value = true;
  msg.value = "";
  try {
    const res = await http.post("/me/leader", { name: name.value, years: years.value, intro: intro.value });
    store.setAuth(store.token, res.data);
    ok.value = true;
    msg.value = res.message || "已提交";
  } catch (e) {
    ok.value = false;
    msg.value = e.message;
  } finally {
    loading.value = false;
  }
}

function goBack() {
  router.push(backPath.value);
}
</script>
