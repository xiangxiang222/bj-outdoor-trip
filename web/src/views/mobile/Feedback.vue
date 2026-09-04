<template>
  <div>
    <p class="muted">功能建议或发现问题，直接写下来。登录后才能提交。</p>
    <label>类型</label>
    <select class="select" v-model="kind">
      <option value="suggest">功能建议</option>
      <option value="bug">找 BUG</option>
    </select>
    <label>内容</label>
    <textarea class="input" v-model="content" rows="5" placeholder="尽量写清页面和复现步骤" />
    <p v-if="msg" :style="ok ? 'color:var(--leaf)' : 'color:var(--clay)'">{{ msg }}</p>
    <button class="btn block" type="button" :disabled="loading" @click="submit">{{ loading ? "提交中…" : "提交" }}</button>
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
const kind = ref("suggest");
const content = ref("");
const msg = ref("");
const ok = ref(false);
const loading = ref(false);

async function submit() {
  msg.value = "";
  if (!requireLogin(store, router, route)) return;
  loading.value = true;
  try {
    const res = await http.post("/feedback", { kind: kind.value, content: content.value });
    ok.value = true;
    msg.value = res.message || "已收到";
    content.value = "";
  } catch (e) {
    ok.value = false;
    msg.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>
