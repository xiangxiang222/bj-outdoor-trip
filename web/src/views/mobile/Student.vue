<template>
  <div>
    <p class="muted">初期先给清华、北大同学开学生价。认证学校填全称，和开团名单对得上才生效。</p>
    <p v-if="store.profile?.isStudent" style="color:var(--leaf)">已认证{{ store.profile.school ? " · " + store.profile.school : "" }}</p>
    <p v-else-if="store.profile?.studentStatus === 'pending'" class="muted">审核中{{ store.profile.school ? " · " + store.profile.school : "" }}</p>
    <label>学校</label>
    <div class="chips">
      <button type="button" class="chip" :class="{ on: school === '清华大学', thu: school === '清华大学' }" @click="school = '清华大学'">清华大学</button>
      <button type="button" class="chip" :class="{ on: school === '北京大学', pku: school === '北京大学' }" @click="school = '北京大学'">北京大学</button>
    </div>
    <input class="input" v-model="school" placeholder="例如：清华大学" />
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
