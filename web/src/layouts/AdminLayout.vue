<template>
  <div class="admin-shell ops-shell">
    <button v-if="menuOpen" class="ops-nav-scrim" type="button" aria-label="收起导航" @click="menuOpen = false"></button>
    <aside class="admin-side ops-side" :class="{ 'is-open': menuOpen }" aria-label="管理导航">
      <router-link to="/admin" class="ops-side-brand">
        <span class="ops-brand-image"><img src="/brand/mark.png" alt="" /></span>
        <span><strong>同行者众</strong><small>在山野，遇见爱</small></span>
        <span class="ops-brand-dot"></span>
      </router-link>
      <div class="ops-console-label">运营管理中心 <span>WORKSPACE</span></div>
      <nav v-for="group in navGroups" :key="group.label" v-show="group.items.some((item) => can(item.cap))" class="admin-nav-group">
        <div class="admin-nav-label">{{ group.label }}</div>
        <template v-for="item in group.items" :key="item.path">
          <router-link v-if="can(item.cap)" :to="item.path">
            <OperationsIcon :name="item.icon" /><span>{{ item.title }}</span>
          </router-link>
        </template>
      </nav>
      <div class="ops-side-bottom">
        <div class="ops-side-mountain"><span>把城市留在身后<br /><strong>把美好带给同行的人</strong></span></div>
        <span class="ops-side-foot">同行者众 · 旅行运营平台</span>
      </div>
    </aside>
    <div class="ops-workspace">
      <header class="admin-top ops-top">
        <div class="ops-top-left">
          <button class="ops-menu-toggle" type="button" :aria-expanded="menuOpen" aria-label="展开导航" @click="menuOpen = !menuOpen"><OperationsIcon name="menu" /></button>
          <div class="ops-breadcrumb"><span>{{ currentGroup }}</span><OperationsIcon name="chevron" /><strong>{{ currentPage }}</strong></div>
        </div>
        <div class="admin-top-tools">
          <a class="admin-jump" href="/m" target="_blank" rel="noopener">用户端 <OperationsIcon name="arrow" /></a>
          <a class="admin-jump" href="/g" target="_blank" rel="noopener">导游端 <OperationsIcon name="arrow" /></a>
          <div v-if="can('ops')" class="admin-bell-wrap">
            <button class="admin-bell" type="button" :aria-expanded="showNotices" aria-label="查看待办消息" @click="toggleNotices"><OperationsIcon name="bell" /><i v-if="unread">{{ unread > 9 ? "9+" : unread }}</i></button>
            <div v-if="showNotices" class="admin-notice-panel">
              <div class="admin-notice-head"><strong>待办消息 <small>{{ unread }} 条未读</small></strong><button v-if="unread" class="admin-notice-readall" type="button" @click="readAll">全部已读</button></div>
              <button v-for="n in notices" :key="n.id" class="admin-notice-item" :class="{ unread: n.unread }" type="button" @click="openNotice(n)"><b>{{ n.title }}</b><span>{{ n.body }}</span><small>{{ n.createdAt }}</small></button>
              <p v-if="!noticesReady && !notices.length" class="muted ops-notice-empty">正在获取消息…</p>
              <div v-else-if="!notices.length" class="ops-notice-empty"><OperationsIcon name="check" /><p>待办都处理好了</p><small>新的申请会显示在这里</small></div>
            </div>
          </div>
          <el-dropdown trigger="click" @command="onUserCommand">
            <span class="admin-user"><span class="ops-user-avatar">{{ (me.name || "管").slice(0, 1) }}</span><span class="ops-user-meta">{{ me.name || "管理员" }}<small>{{ me.roleLabel || roleLabel(me.role) }}</small></span><OperationsIcon name="down" /></span>
            <template #dropdown><el-dropdown-menu><el-dropdown-item command="out">退出登录</el-dropdown-item></el-dropdown-menu></template>
          </el-dropdown>
        </div>
      </header>
      <main class="admin-main" id="operations-main">
        <div v-if="sessionError" class="ops-error" role="alert"><span>{{ sessionError }}</span><button type="button" @click="refreshSession">重新连接</button></div>
        <div class="admin-page" :class="{ dash: route.path === '/admin' }"><router-view /></div>
        <footer class="ops-main-footer">同行者众 · 在山野，遇见爱</footer>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import http from "@/api/http";
import OperationsIcon from "@/components/OperationsIcon.vue";
import "@/styles/operations.css";
import { capsOf, hasCap, roleLabel } from "@/utils/staff";
const router = useRouter();
const route = useRoute();
const menuOpen = ref(false);
const sessionError = ref("");
function refreshSession() { window.location.reload(); }
const navGroups = [
  { label: "经营工作台", items: [
    { title: "经营概览", path: "/admin", icon: "grid", cap: "ops" },
    { title: "线路管理", path: "/admin/routes", icon: "route", cap: "ops" },
    { title: "发团与排期", path: "/admin/schedules", icon: "calendar", cap: "roster" },
    { title: "报名与收款", path: "/admin/enrollments", icon: "wallet", cap: "roster" },
  ] },
  { label: "用户与增长", items: [
    { title: "用户与会员", path: "/admin/users", icon: "people", cap: "ops" },
    { title: "认证审批", path: "/admin/verify", icon: "shield", cap: "ops" },
    { title: "优惠券", path: "/admin/coupons", icon: "ticket", cap: "ops" },
    { title: "活动抽奖", path: "/admin/lottery", icon: "gift", cap: "ops" },
    { title: "意见反馈", path: "/admin/feedback", icon: "chat", cap: "ops" },
  ] },
  { label: "平台设置", items: [
    { title: "玩法标签", path: "/admin/tags", icon: "tag", cap: "ops" },
    { title: "退费规则", path: "/admin/refund", icon: "refund", cap: "ops" },
    { title: "团队与权限", path: "/admin/staff", icon: "settings", cap: "staff" },
  ] },
];
const currentPage = computed(() => navGroups.flatMap((g) => g.items).find((item) => item.path === route.path)?.title || "经营工作台");
const currentGroup = computed(() => navGroups.find((g) => g.items.some((item) => item.path === route.path))?.label || "经营工作台");
watch(() => route.path, () => { menuOpen.value = false; showNotices.value = false; });
const me = ref({
  name: localStorage.getItem("bj_admin_name") || "",
  role: localStorage.getItem("bj_admin_role") || "admin",
  caps: [],
});
me.value.caps = capsOf(me.value.role);
const notices = ref([]);
const noticesReady = ref(false);
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
  } finally {
    noticesReady.value = true;
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

function onKeydown(e) {
  if (e.key === "Escape") { showNotices.value = false; menuOpen.value = false; }
}

function onDocClick(e) {
  const wrap = e.target?.closest?.(".admin-bell-wrap");
  if (!wrap) showNotices.value = false;
}

function onUserCommand(cmd) {
  if (cmd === "out") out();
}

onMounted(async () => {
  document.documentElement.classList.add("admin-theme");
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
    document.addEventListener("keydown", onKeydown);
  } catch (e) {
    if (e.status === 401 || e.status === 403) out();
    else sessionError.value = "账号信息暂时未能同步，请检查网络并重新连接。";
  }
});
onUnmounted(() => {
  document.documentElement.classList.remove("admin-theme");
  if (noticeTimer) window.clearInterval(noticeTimer);
  window.removeEventListener("admin-notices-refresh", loadNotices);
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("keydown", onKeydown);
});

function out() {
  localStorage.removeItem("bj_admin_token");
  localStorage.removeItem("bj_admin_name");
  localStorage.removeItem("bj_admin_role");
  router.push("/admin/login");
}
</script>
