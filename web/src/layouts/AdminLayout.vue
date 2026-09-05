<template>
  <div class="admin-shell">
    <aside class="admin-side">
      <div class="admin-brand">
        <BrandMark size="md" />
        <div class="admin-brand-sub">清北同学的山野局 · 后台</div>
      </div>
      <router-link v-if="can('ops')" to="/admin">数据看板</router-link>
      <router-link v-if="can('ops')" to="/admin/routes">线路管理</router-link>
      <router-link v-if="can('roster')" to="/admin/schedules">拼团与成本</router-link>
      <router-link v-if="can('roster')" to="/admin/enrollments">报名与收款</router-link>
      <router-link v-if="can('ops')" to="/admin/coupons">优惠券</router-link>
      <router-link v-if="can('ops')" to="/admin/users">用户与会员</router-link>
      <router-link v-if="can('ops')" to="/admin/tags">玩法标签</router-link>
      <router-link v-if="can('staff')" to="/admin/staff">管理员</router-link>
      <a href="/m" target="_blank">打开用户端</a>
      <a href="/g" target="_blank">打开导游端</a>
      <a href="#" @click.prevent="out">退出</a>
      <div class="admin-me">{{ me.name || "管理员" }} · {{ me.roleLabel || roleLabel(me.role) }}</div>
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
import { useRouter, useRoute } from "vue-router";
import http from "@/api/http";
import { capsOf, hasCap, roleLabel } from "@/utils/staff";
import BrandMark from "@/components/BrandMark.vue";

const router = useRouter();
const route = useRoute();
const me = ref({
  name: localStorage.getItem("bj_admin_name") || "",
  role: localStorage.getItem("bj_admin_role") || "admin",
  caps: [],
});
me.value.caps = capsOf(me.value.role);

function can(cap) {
  return hasCap(me.value, cap);
}

onMounted(async () => {
  try {
    const res = await http.get("/admin/me");
    me.value = res.data;
    localStorage.setItem("bj_admin_name", res.data.name || "");
    localStorage.setItem("bj_admin_role", res.data.role || "admin");
    if (route.path === "/admin" && !can("ops")) router.replace("/admin/schedules");
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
