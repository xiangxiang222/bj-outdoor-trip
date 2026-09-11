<template>
  <div class="admin-login">
    <div class="admin-login-card">
      <div class="admin-login-brand">
        <img src="/brand/logo.jpg" alt="同行者众" />
        <div>
          <strong>同行者众</strong>
          <span>管理后台</span>
        </div>
      </div>
      <el-input v-model="username" placeholder="账号" size="large" @keyup.enter="login" />
      <el-input v-model="password" type="password" show-password placeholder="密码" size="large" @keyup.enter="login" />
      <el-button type="primary" size="large" class="admin-login-btn" @click="login">登录</el-button>
      <p class="admin-login-hint">默认 admin / admin123</p>
      <p v-if="err" class="admin-login-err">{{ err }}</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
const username = ref("admin");
const password = ref("admin123");
const err = ref("");
const router = useRouter();
onMounted(() => document.documentElement.classList.add("admin-theme"));
onUnmounted(() => document.documentElement.classList.remove("admin-theme"));
async function login() {
  try {
    const res = await http.post("/admin/login", { username: username.value, password: password.value });
    localStorage.setItem("bj_admin_token", res.data.token);
    localStorage.setItem("bj_admin_name", res.data.name || "");
    localStorage.setItem("bj_admin_role", res.data.role || "admin");
    router.push("/admin");
  } catch (e) {
    err.value = e.message;
  }
}
</script>
