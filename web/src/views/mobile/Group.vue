<template>
  <div>
    <p class="muted">学生会、跑团、品牌等团体需后台认证通过后，才能按团体身份发活动。</p>
    <p v-if="store.profile?.groupStatus === 'approved'" style="color:var(--leaf)">已认证 · {{ store.profile.groupName }}</p>
    <p v-else-if="store.profile?.groupStatus === 'pending'" class="muted">审核中 · {{ store.profile.groupName }}</p>
    <label>团体名称</label>
    <input class="input" v-model="name" placeholder="例如：某某大学登山队" />
    <label>类型</label>
    <select class="select" v-model="kind">
      <option>学生组织</option>
      <option>跑团</option>
      <option>品牌</option>
      <option>其他</option>
    </select>
    <p v-if="msg" :style="ok ? 'color:var(--leaf)' : 'color:var(--clay)'">{{ msg }}</p>
    <button class="btn block" type="button" :disabled="loading || store.profile?.groupStatus === 'approved'" @click="submit">{{ loading ? "提交中…" : "提交认证" }}</button>
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
const name = ref(store.profile?.groupName || "");
const kind = ref(store.profile?.groupKind || "学生组织");
const msg = ref("");
const ok = ref(false);
const loading = ref(false);

async function submit() {
  if (!requireLogin(store, router, route)) return;
  loading.value = true;
  msg.value = "";
  try {
    const res = await http.post("/me/group", { name: name.value, kind: kind.value });
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
