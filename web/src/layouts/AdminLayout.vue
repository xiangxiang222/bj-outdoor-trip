<template>
  <div class="admin-shell">
    <aside class="admin-side">
      <div class="admin-brand">
        <img src="/brand/logo.jpg" alt="同行者众" />
        <div class="admin-brand-sub">后台 · 线路 · 排期 · 财务</div>
      </div>
      <router-link v-if="can('ops')" to="/admin">数据看板</router-link>
      <router-link v-if="can('ops')" to="/admin/routes">线路管理</router-link>
      <router-link v-if="can('roster')" to="/admin/schedules">拼团与成本</router-link>
      <router-link v-if="can('roster')" to="/admin/enrollments">报名与收款</router-link>
      <router-link v-if="can('ops')" to="/admin/coupons">优惠券</router-link>
      <router-link v-if="can('ops')" to="/admin/users">用户与会员</router-link>
      <router-link v-if="can('ops')" to="/admin/verify">认证审批</router-link>
      <router-link v-if="can('ops')" to="/admin/tags">玩法标签</router-link>
      <router-link v-if="can('staff')" to="/admin/staff">管理员</router-link>
      <a href="/m" target="_blank">打开用户端</a>
      <a href="/g" target="_blank">打开导游端</a>
      <a href="#" @click.prevent="out">退出</a>
      <div class="admin-me">{{ me.name || "管理员" }} · {{ me.roleLabel || roleLabel(me.role) }}</div>
    </aside>
    <main class="admin-main">
      <header v-if="can('ops')" class="admin-top">
        <span class="muted">待办会显示在这里，点消息可直接去审批。</span>
        <div class="admin-bell-wrap">
          <button class="admin-bell" type="button" @click="toggleNotices">
            消息
            <i v-if="unread">{{ unread > 9 ? "9+" : unread }}</i>
          </button>
          <div v-if="showNotices" class="admin-notice-panel">
            <div class="admin-notice-head">
              <strong>待办消息</strong>
              <button v-if="unread" class="admin-notice-readall" type="button" @click="readAll">全部已读</button>
            </div>
            <button
              v-for="n in notices"
              :key="n.id"
              class="admin-notice-item"
              :class="{ unread: n.unread }"
              type="button"
              @click="openNotice(n)"
            >
              <b>{{ n.title }}</b>
              <span>{{ n.body }}</span>
              <small>{{ n.createdAt }}</small>
            </button>
            <p v-if="!notices.length" class="muted" style="margin:12px 8px">暂无消息</p>
          </div>
        </div>
      </header>
      <div style="padding:20px 24px">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import http from "@/api/http";
import { capsOf, hasCap, roleLabel } from "@/utils/staff";
const router = useRouter();
const route = useRoute();
const me = ref({
  name: localStorage.getItem("bj_admin_name") || "",
  role: localStorage.getItem("bj_admin_role") || "admin",
  caps: [],
});
me.value.caps = capsOf(me.value.role);
const notices = ref([]);
const unread = ref(0);
const showNotices = ref(false);
let noticeTimer = 0;

function can(cap) {
  return hasCap(me.value, cap);
}

async function loadNotices() {
  if (!can("ops")) return;
  try {
    const res = await http.get("/admin/notices");
    notices.value = res.data?.list || [];
    unread.value = Number(res.data?.unread || 0);
  } catch {
    /* 登录失效时由 /admin/me 处理 */
  }
}

function toggleNotices() {
  showNotices.value = !showNotices.value;
  if (showNotices.value) loadNotices();
}

function noticeHref(href) {
  const value = String(href || "").trim();
  return value.startsWith("/admin/") ? value : "/admin/verify";
}

async function openNotice(n) {
  showNotices.value = false;
  if (n?.id && n.unread) {
    try {
      await http.post(`/admin/notices/${n.id}/read`);
    } catch {
      /* 仍跳转审批页 */
    }
    n.unread = false;
    unread.value = Math.max(0, unread.value - 1);
  }
  router.push(noticeHref(n?.href));
}

async function readAll() {
  try {
    const res = await http.post("/admin/notices/read-all");
    notices.value = res.data?.list || [];
    unread.value = Number(res.data?.unread || 0);
  } catch {
    /* ignore */
  }
}

function onDocClick(e) {
  const wrap = e.target?.closest?.(".admin-bell-wrap");
  if (!wrap) showNotices.value = false;
}

onMounted(async () => {
  try {
    const res = await http.get("/admin/me");
    me.value = res.data;
    localStorage.setItem("bj_admin_name", res.data.name || "");
    localStorage.setItem("bj_admin_role", res.data.role || "admin");
    if (route.path === "/admin" && !can("ops")) router.replace("/admin/schedules");
    await loadNotices();
    noticeTimer = window.setInterval(loadNotices, 20000);
    window.addEventListener("admin-notices-refresh", loadNotices);
    document.addEventListener("click", onDocClick);
  } catch {
    out();
  }
});
onUnmounted(() => {
  if (noticeTimer) window.clearInterval(noticeTimer);
  window.removeEventListener("admin-notices-refresh", loadNotices);
  document.removeEventListener("click", onDocClick);
});

function out() {
  localStorage.removeItem("bj_admin_token");
  localStorage.removeItem("bj_admin_name");
  localStorage.removeItem("bj_admin_role");
  router.push("/admin/login");
}
</script>
