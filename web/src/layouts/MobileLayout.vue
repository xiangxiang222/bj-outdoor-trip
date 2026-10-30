<template>
  <div class="mp-phone" :class="{ 'is-account': accountTone, 'is-home': isHome, 'is-catalog': isHome && route.query.view === 'routes', 'is-mine': route.name === 'mine', 'is-wishes': route.path.startsWith('/m/wishes'), 'is-orders': route.name === 'orders', 'is-look-font': route.name === 'look-font', 'is-activities': route.name === 'activities', 'is-activity-publish': route.name === 'publish' && route.query.channel === 'activity' }">
    <div class="mp-status" :class="{ 'is-home': isHome }">
      <router-link to="/m" class="brand-lockup" aria-label="同行者众 首页">
        <span class="brand-mark-frame" aria-hidden="true">
          <img src="/brand/mark.png" alt="" />
        </span>
        <span class="brand-type">
          <span class="brand-name">同行者众</span>
          <span v-if="isHome" class="brand-tagline">在山野，遇见爱</span>
        </span>
      </router-link>
      <nav class="desktop-nav" aria-label="主导航">
        <router-link to="/m" :class="{ selected: isHome }">发现山野</router-link>
        <router-link to="/m/activities">同城相遇</router-link>
        <router-link to="/m/orders">我的行程</router-link>
        <router-link to="/m/mine">会员与我的</router-link>
      </nav>
      <div class="header-actions">
        <router-link class="header-help" to="/m/official" aria-label="联系客服"><TravelIcon name="headset" /><span>旅行顾问</span></router-link>
        <router-link class="header-publish" to="/m/publish"><span>＋</span> 发起旅行</router-link>
      </div>
    </div>
    <div v-if="!isHome && !['mine', 'orders'].includes(route.name)" class="mp-nav">
      <button v-if="showBack" class="nav-back" type="button" aria-label="返回" @click="goBack">‹</button>
      <div>
        <h1>{{ title }}</h1>
        <div class="sub">{{ subtitle }}</div>
      </div>
    </div>
    <main ref="scrollBody" class="mp-body" :class="{ 'is-detail': ['route', 'schedule'].includes(route.name) }">
      <router-view />
    </main>
    <a class="icp-foot" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">京ICP备2026060284号-2</a>
    <nav class="mp-tab">
      <router-link to="/m" :class="{ active: $route.path === '/m' }">
        <svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true">
          <g class="stroke"><path d="M4.2 11.1 12 4.2l7.8 6.9V20a1.2 1.2 0 0 1-1.2 1.2H5.4A1.2 1.2 0 0 1 4.2 20Z" /><path d="M10 21.2V15h4v6.2" /></g>
          <path class="solid" fill-rule="evenodd" d="M4.2 11.1 12 4.2l7.8 6.9V20a1.2 1.2 0 0 1-1.2 1.2H5.4A1.2 1.2 0 0 1 4.2 20V11.1Zm5.9 10.1v-6h3.8v6h-3.8Z" />
        </svg>
        首页
      </router-link>
      <router-link to="/m/activities" :class="{ active: $route.path.startsWith('/m/activities') }">
        <svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true">
          <g class="stroke"><rect x="4.6" y="8.4" width="14.8" height="11" rx="1.6" /><path d="M9 8.4V6.5A1.4 1.4 0 0 1 10.4 5.1h3.2A1.4 1.4 0 0 1 15 6.5v1.9" /></g>
          <path class="solid" fill-rule="evenodd" d="M4.6 8.6h14.8a1.6 1.6 0 0 1 1.6 1.6v7.6a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 17.8V10.2A1.6 1.6 0 0 1 4.6 8.6Zm4.5 0V6.6a1.5 1.5 0 0 1 1.5-1.5h2.8a1.5 1.5 0 0 1 1.5 1.5V8.6h-1.5V6.7a.15.15 0 0 0-.15-.15h-2.5a.15.15 0 0 0-.15.15V8.6H9.1Z" />
        </svg>
        活动
      </router-link>
      <router-link to="/m/orders" :class="{ active: $route.path.startsWith('/m/orders') }">
        <svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true">
          <g class="stroke"><rect x="4.4" y="5.6" width="15.2" height="13.6" rx="1.6" /><path d="M4.4 9.8h15.2M8.2 3.6v3.4M15.8 3.6v3.4" /><rect x="7.8" y="12.2" width="2.5" height="2.5" rx="0.3" /><rect x="13.7" y="12.2" width="2.5" height="2.5" rx="0.3" /></g>
          <g class="solid"><path fill-rule="evenodd" d="M5 6h14a1.5 1.5 0 0 1 1.5 1.5V18.6A1.5 1.5 0 0 1 19 20.1H5A1.5 1.5 0 0 1 3.5 18.6V7.5A1.5 1.5 0 0 1 5 6Zm2.9 6.4h2.6v2.6H7.9Zm5.6 0h2.6v2.6h-2.6Z" /><rect x="7.5" y="3.3" width="1.6" height="4.2" rx="0.8" /><rect x="14.9" y="3.3" width="1.6" height="4.2" rx="0.8" /></g>
        </svg>
        行程
      </router-link>
      <router-link to="/m/mine" :class="{ active: mineActive }">
        <svg class="tab-ico" viewBox="0 0 24 24" aria-hidden="true">
          <g class="stroke"><circle cx="12" cy="8" r="3.15" /><path d="M5.1 19.6c.7-3.5 3.3-5.3 6.9-5.3s6.2 1.8 6.9 5.3" /></g>
          <g class="solid"><path d="M12 4.7a3.35 3.35 0 1 1 0 6.7 3.35 3.35 0 0 1 0-6.7Z" /><path d="M4.6 20.1c.8-3.8 3.6-5.9 7.4-5.9s6.6 2.1 7.4 5.9H4.6Z" /></g>
        </svg>
        我的
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";
import { chromeTitle, chromeSubtitle, clearChrome } from "@/utils/pageChrome";
import { applyLook, readLook } from "@/utils/appearance";
import TravelIcon from "@/components/TravelIcon.vue";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const scrollBody = ref(null);
const media = window.matchMedia("(prefers-color-scheme: dark)");
const updateLook = () => applyLook(readLook());
onMounted(() => {
  store.fetchMeta().catch(() => {});
  applyLook(readLook());
  media.addEventListener?.("change", updateLook);
});
onUnmounted(() => media.removeEventListener?.("change", updateLook));
watch(() => route.path, () => {
  clearChrome();
  if (scrollBody.value) scrollBody.value.scrollTop = 0;
});

const tabNames = new Set(["home", "activities", "orders", "mine"]);
const isHome = computed(() => route.name === "home");
const showBack = computed(() => !tabNames.has(route.name));
const accountPaths = ["/m/wishes", "/m/activities", "/m/mine", "/m/login", "/m/member", "/m/favorites", "/m/notices", "/m/views", "/m/companions", "/m/follows", "/m/student", "/m/group", "/m/leader", "/m/photo-apply", "/m/route-apply", "/m/official", "/m/feedback", "/m/wallet", "/m/signin", "/m/settings", "/m/profile", "/m/orders", "/m/lottery", "/m/publish", "/m/coupons", "/m/user"];
const accountTone = computed(() => accountPaths.some((p) => route.path === p || route.path.startsWith(p + "/")));
const mineActive = computed(() =>
  ["/m/wishes", "/m/mine", "/m/login", "/m/member", "/m/favorites", "/m/notices", "/m/views", "/m/companions", "/m/follows", "/m/student", "/m/group", "/m/leader", "/m/photo-apply", "/m/route-apply", "/m/official", "/m/feedback", "/m/wallet", "/m/signin", "/m/settings", "/m/profile"].some(
    (p) => route.path === p || route.path.startsWith(p + "/")
  )
);

function goBack() {
  if (route.name === "login") {
    router.replace("/m/mine");
    return;
  }
  if (window.history.length > 1) router.back();
  else router.replace("/m/mine");
}

const title = computed(() => {
  const map = {
    home: "同行者众",
    discover: "一句话找团",
    activities: "同城活动",
    official: "客服与规则",
    rules: "客服与规则",
    student: "校园认证",
    group: "团体认证",
    leader: "领队申请",
    "photo-apply": "摄影师申请",
    feedback: "意见反馈",
    lottery: "抽奖",
    after: "完成活动",
    routes: "线路列表",
    route: "线路详情",
    schedule: "详情",
    enroll: "报名",
    coupon: "优惠券",
    coupons: "我的优惠券",
    open: "发布排期",
    chain: "进行中的团",
    mine: "我的",
    settings: "设置",
    profile: "实名信息",
    wallet: "我的钱包",
    signin: "每日签到",
    "wallet-cards": "提现说明",
    "wallet-pin": "支付密码",
    login: "登录 / 注册",
    member: "会员中心",
    orders: "行程",
    order: "订单详情",
    favorites: "我的收藏",
    notices: "消息",
    views: "最近看过",
    companions: "常用报名人",
    follows: "关注领队",
    stats: "本团画像",
    guides: "领队导游",
    guide: "导游详情",
    user: "个人主页",
    publish: "发布",
    "route-apply": "申请收录线路",
  };
  return chromeTitle.value || map[route.name] || "同行者众";
});
const subtitle = computed(() => {
  const map = {
    home: "在山野，遇见爱",
    discover: "说说期待，找到真实可参与的一程",
    activities: "把熟悉的城市，过成新的相遇",
    official: "加微信、看规则、找客服",
    rules: "加微信、看规则、找客服",
    student: "认证后可走学生价",
    leader: "通过后可在团里报名领队",
    "photo-apply": "免个人团费，一个团一位",
    mine: "账号、权益与客服",
    signin: "连续签到，积分直接入账",
    orders: "每一次出发，都在这里",
    order: "集合、费用和订单号",
    publish: route.query.channel === "activity" ? "提交后需管理员审核，通过后出现在活动 Tab。" : "选一条已经通过的线路，填好这场出发就能发团。",
    "route-apply": "通过后出现在线路目录",
    feedback: "体验问题、活动与领队",
  };
  return chromeSubtitle.value || map[route.name] || "在山野，遇见爱";
});
</script>

<style scoped>
:global(html[data-night="dark"] .mp-phone.is-orders) { background:#1a121c; background-image:none; }
:global(html[data-night="dark"] .is-orders .mp-status), :global(html[data-night="dark"] .is-orders .mp-nav) { background:#211b29; border-color:#392f43; }
:global(html[data-night="dark"] .is-orders .brand-name) { color:#eee7f5; }
:global(html[data-night="dark"] .is-orders .desktop-nav a), :global(html[data-night="dark"] .is-orders .header-help) { color:#c0b0cf; }
:global(html[data-night="dark"] .mp-phone.is-catalog) { background:#1a121c; background-image:none; }
:global(html[data-night="dark"] .is-catalog .mp-status) { background:#211b29; border-color:#392f43; }
:global(html[data-night="dark"] .is-catalog .brand-name) { color:#eee7f5; }
:global(html[data-night="dark"] .is-catalog .brand-tagline), :global(html[data-night="dark"] .is-catalog .desktop-nav a), :global(html[data-night="dark"] .is-catalog .header-help) { color:#c0b0cf; }
:global(html[data-night="dark"] .is-catalog .icp-foot), :global(html[data-night="dark"] .is-orders .icp-foot) { color:#a594b4; background:#211b29; }
:global(html[data-night="dark"] .is-catalog .mp-tab), :global(html[data-night="dark"] .is-orders .mp-tab) { background:#211b29; border-color:#392f43; }
:global(html[data-night="dark"] .is-catalog .mp-tab a.active), :global(html[data-night="dark"] .is-orders .mp-tab a.active) { color:#d2b5ef; }
:global(html[data-night="dark"] .mp-phone.is-activities), :global(html[data-night="dark"] .mp-phone.is-activity-publish) { background:#1a121c; background-image:none; }
:global(html[data-night="dark"] .is-activities .mp-status), :global(html[data-night="dark"] .is-activities .mp-nav), :global(html[data-night="dark"] .is-activity-publish .mp-status), :global(html[data-night="dark"] .is-activity-publish .mp-nav) { background:#211b29; border-color:#392f43; }
:global(html[data-night="dark"] .is-activities .brand-name), :global(html[data-night="dark"] .is-activity-publish .brand-name) { color:#eee7f5; }
:global(html[data-night="dark"] .is-activities .desktop-nav a), :global(html[data-night="dark"] .is-activities .header-help), :global(html[data-night="dark"] .is-activity-publish .desktop-nav a), :global(html[data-night="dark"] .is-activity-publish .header-help) { color:#c0b0cf; }
</style>
