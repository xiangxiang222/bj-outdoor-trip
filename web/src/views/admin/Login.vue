<template>
  <div class="admin-login ops-login">
    <section class="ops-login-visual">
      <router-link to="/m" class="ops-side-brand"><span class="ops-brand-image"><img src="/brand/mark.png" alt="" /></span><span><strong>同行者众</strong><small>在山野，遇见爱</small></span></router-link>
      <div><span class="ops-eyebrow">A BETTER JOURNEY, TOGETHER</span><h1>把美好的旅程<br />交给专业的你。</h1><p>线路、发团、服务与经营<br />让每一次同行，都被认真对待。</p></div>
    </section>
    <div class="ops-login-form-wrap">
      <form class="admin-login-card" @submit.prevent="login">
        <span class="ops-eyebrow">OPERATIONS WORKSPACE</span><h2>欢迎回到管理中心</h2><p class="ops-login-sub">登录你的工作账号，开启今天的旅程。</p>
        <label for="ops-username">工作账号</label><el-input id="ops-username" v-model="username" placeholder="请输入管理员账号" autocomplete="username" size="large" />
        <label for="ops-password">登录密码</label><el-input id="ops-password" v-model="password" type="password" show-password placeholder="请输入密码" autocomplete="current-password" size="large" />
        <el-button native-type="submit" type="primary" size="large" class="admin-login-btn" :loading="loading">{{ loading ? '正在登录' : '登录管理中心' }}</el-button>
        <p v-if="demo" class="admin-login-hint">本地演示：admin / admin123</p><p v-if="err" class="admin-login-err" role="alert">{{ err }}</p>
        <div class="ops-login-links"><router-link to="/m">浏览用户端 ↗</router-link><router-link to="/g/login">导游工作台 ↗</router-link></div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import "@/styles/operations.css";
const demo = import.meta.env.DEV;
const username = ref(demo ? "admin" : "");
const password = ref(demo ? "admin123" : "");
const err = ref("");
const loading = ref(false);
const router = useRouter();
onMounted(() => document.documentElement.classList.add("admin-theme"));
onUnmounted(() => document.documentElement.classList.remove("admin-theme"));
async function login() {
  if (loading.value) return;
  err.value = "";
  if (!username.value.trim() || !password.value) { err.value = "请填写工作账号和登录密码"; return; }
  loading.value = true;
  try {
    const res = await http.post("/admin/login", { username: username.value.trim(), password: password.value });
    localStorage.setItem("bj_admin_token", res.data.token);
    localStorage.setItem("bj_admin_name", res.data.name || "");
    localStorage.setItem("bj_admin_role", res.data.role || "admin");
    router.push("/admin");
  } catch (e) {
    err.value = e.message;
  } finally { loading.value = false; }
}
</script>
