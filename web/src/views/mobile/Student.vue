<template>
  <div>
    <p class="muted">认证通过后，发团勾选「适用学生价」的团会按学生折扣报价。部分团只对学生或指定高校开放，认证学校需与开团名单对得上。</p>
    <p v-if="store.profile?.isStudent" style="color:var(--leaf)">已认证{{ store.profile.school ? " · " + store.profile.school : "" }}</p>
    <p v-else-if="store.profile?.studentStatus === 'pending'" class="muted">审核中{{ store.profile.school ? " · " + store.profile.school : "" }}</p>
    <label>学校</label>
    <input class="input" v-model="school" placeholder="例如：北京大学" />
    <p v-if="msg" :style="ok ? 'color:var(--leaf)' : 'color:var(--clay)'">{{ msg }}</p>
    <button class="btn block" type="button" :disabled="loading || store.profile?.isStudent" @click="submit">{{ loading ? "提交中…" : "提交认证" }}</button>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";

const store = useUserStore();
const route = useRoute();
const router = useRouter();
const school = ref(store.profile?.school || "");
const msg = ref("");
const ok = ref(false);
const loading = ref(false);

async function submit() {
  if (!requireLogin(store, router, route)) return;
  loading.value = true;
  msg.value = "";
  try {
    const res = await http.post("/me/student", { school: school.value });
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
</script>
