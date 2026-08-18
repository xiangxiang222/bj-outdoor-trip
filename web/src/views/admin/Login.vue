<template>
  <div style="max-width:360px;margin:12vh auto;background:#fff;padding:32px;border-radius:16px">
    <h2>北野行管理后台</h2>
    <el-input v-model="username" placeholder="账号" style="margin:8px 0" />
    <el-input v-model="password" type="password" placeholder="密码" style="margin:8px 0" />
    <el-button type="success" style="width:100%;margin-top:12px" @click="login">登录</el-button>
    <p style="color:#888;font-size:13px">默认 admin / admin123</p>
    <p style="color:#bc4749">{{ err }}</p>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
const username = ref("admin");
const password = ref("admin123");
const err = ref("");
const router = useRouter();
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
