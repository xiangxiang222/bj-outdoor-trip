<template>
  <div style="display:flex">
    <aside class="admin-side">
      <div style="padding:24px 20px 8px;font-weight:700;font-size:18px">北野行后台</div>
      <div style="padding:0 20px 16px;font-size:12px;opacity:.6">线路 · 排期 · 财务 · 账号</div>
      <router-link to="/admin">数据看板</router-link>
      <router-link to="/admin/routes">线路管理</router-link>
      <router-link to="/admin/schedules">拼团与成本</router-link>
      <router-link to="/admin/enrollments">报名与收款</router-link>
      <router-link to="/admin/users">用户与会员</router-link>
      <router-link v-if="me.role === 'admin'" to="/admin/staff">管理员</router-link>
      <a href="/m" target="_blank">打开用户端</a>
      <a href="/g" target="_blank">打开导游端</a>
      <a href="#" @click.prevent="out">退出</a>
      <div class="admin-me">{{ me.name || "管理员" }} · {{ me.role === "operator" ? "运营" : "管理员" }}</div>
    </aside>
    <main class="admin-main">
      <div style="padding:20px 24px">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";

const router = useRouter();
const me = ref({
  name: localStorage.getItem("bj_admin_name") || "",
  role: localStorage.getItem("bj_admin_role") || "admin",
});

onMounted(async () => {
  try {
    const res = await http.get("/admin/me");
    me.value = res.data;
    localStorage.setItem("bj_admin_name", res.data.name || "");
    localStorage.setItem("bj_admin_role", res.data.role || "admin");
  } catch {
    out();
  }
});

function out() {
  localStorage.removeItem("bj_admin_token");
  localStorage.removeItem("bj_admin_name");
  localStorage.removeItem("bj_admin_role");
  router.push("/admin/login");
}
</script>
