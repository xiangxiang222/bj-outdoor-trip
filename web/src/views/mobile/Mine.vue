<template>
  <div class="mine-page">
    <template v-if="store.token && store.profile">
      <div class="mine-hero-card">
        <div class="mine-user">
          <button class="mine-avatar" type="button" @click="openAvatar">
            <img v-if="store.profile.avatar" :src="store.profile.avatar" alt="" />
            <span v-else>{{ (store.profile.nickname || "友").slice(0, 1) }}</span>
          </button>
          <button class="mine-user-main" type="button" @click="$router.push('/m/user/' + store.profile.id)">
            <div class="mine-name">{{ store.profile.nickname }}</div>
            <div class="mine-phone">{{ maskPhone(store.profile.phone) }}</div>
          </button>
        </div>
        <button class="mine-gear" type="button" @click="goAuth('/m/settings')">设置</button>
      </div>

      <button v-if="store.profile.membership" class="mine-member" type="button" @click="openMember">
        <div>
          <strong>{{ store.profile.membership.code }} {{ store.profile.membership.name }}</strong>
          <span>本月累计新增 {{ store.profile.membership.monthGrowth }} 成长值</span>
        </div>
        <i>会员中心 ›</i>
      </button>

      <div class="mine-shortcuts">
        <button type="button" @click="$router.push('/m/orders')">
          <b>{{ (hub.upcomingCount || 0) + (hub.waitlistCount || 0) }}</b>
          <span>全部行程</span>
        </button>
        <button type="button" @click="$router.push('/m/orders')">
          <b>{{ hub.upcomingCount || 0 }}</b>
          <span>待出发</span>
        </button>
        <button type="button" @click="$router.push('/m/orders')">
          <b>{{ hub.unpaidCount || 0 }}</b>
          <span>待支付</span>
        </button>
        <button type="button" @click="$router.push('/m/official')">
          <b>客服</b>
          <span>加微信</span>
        </button>
      </div>

      <button class="mine-wallet" type="button" @click="goAuth('/m/wallet')">
        <div class="mine-wallet-item">
          <strong>{{ hub.balance ?? store.profile.walletBalance ?? 0 }}</strong>
          <span>余额（元）</span>
        </div>
        <div class="mine-wallet-item">
          <strong>{{ hub.couponCount || coupons.length || 0 }}</strong>
          <span>优惠券</span>
        </div>
        <div class="mine-wallet-item">
          <strong>{{ store.profile.points || 0 }}</strong>
          <span>积分</span>
        </div>
        <i>我的钱包 ›</i>
      </button>
    </template>

    <div v-else class="card">
      <div class="pad">
        <p style="margin-top:0">登录后可报名、开团，余额也能用来付团费和提现。</p>
        <button class="btn block" type="button" @click="goLogin()">登录</button>
        <button class="btn ghost block" type="button" style="margin-top:8px" @click="goLogin('', 'register')">注册</button>
      </div>
    </div>

    <p class="cell-label">常用</p>
    <div class="mine-grid">
      <button type="button" @click="goAuth('/m/favorites')"><span>★</span>我的收藏</button>
      <button type="button" @click="goAuth('/m/student')"><span>学</span>{{ campusShort }}</button>
      <button type="button" @click="goAuth('/m/leader')"><span>队</span>{{ leaderShort }}</button>
      <button type="button" @click="goAuth('/m/publish')"><span>团</span>去发团</button>
      <button type="button" @click="goReferral"><span>荐</span>推荐报名</button>
      <button type="button" @click="goAuth('/m/lottery')"><span>奖</span>抽奖</button>
      <button type="button" @click="goAuth('/m/route-apply')"><span>线</span>收录线路</button>
      <button type="button" @click="goAuth('/m/feedback')"><span>问</span>建议反馈</button>
    </div>

    <p class="cell-label">服务</p>
    <div class="cell-group">
      <button class="cell" type="button" @click="goAuth('/m/group')">
        <span>{{ groupLabel }}</span><i>›</i>
      </button>
      <button class="cell" type="button" @click="$router.push('/m/official')">
        <span>客服与规则</span><i>加微信、FAQ ›</i>
      </button>
      <button class="cell" type="button" @click="$router.push({ path: '/m', query: { view: 'routes' } })">
        <span>看线路</span><i>官方目的地 ›</i>
      </button>
    </div>

    <div v-if="picker" class="avatar-mask" @click.self="picker = false">
      <div class="avatar-sheet">
        <p>选择默认头像</p>
        <div class="avatar-grid">
          <button v-for="item in defaults" :key="item.id" type="button" @click="saveAvatar(item.url)">
            <img :src="item.url" alt="" />
          </button>
        </div>
        <label class="avatar-action">
          拍照
          <input type="file" accept="image/*" capture="environment" hidden @change="onFile" />
        </label>
        <label class="avatar-action">
          从相册选择
          <input type="file" accept="image/*" hidden @change="onFile" />
        </label>
        <button class="avatar-action" type="button" @click="picker = false">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { maskPhone } from "@/utils/labels";

const store = useUserStore();
const router = useRouter();
const coupons = ref([]);
const hub = ref({});
const picker = ref(false);
const defaults = ref([]);

const campusShort = computed(() => {
  const u = store.profile;
  if (u?.isAlumni) return "校友已认证";
  if (u?.isStudent) return "学生已认证";
  if (u?.studentStatus === "pending") return "认证审核中";
  return "校园认证";
});
const leaderShort = computed(() => {
  const u = store.profile;
  if (u?.isLeader) return "领队已认证";
  if (u?.leaderStatus === "pending") return "申请审核中";
  return "领队申请";
});
const groupLabel = computed(() => {
  const u = store.profile;
  if (u?.groupStatus === "approved") return "团体已认证";
  if (u?.groupStatus === "pending") return "团体认证审核中";
  return "团体认证";
});

onMounted(load);

async function load() {
  await store.fetchMe().catch(() => {});
  if (!store.token) return;
  try {
    const rows = (await http.get("/me/coupons")).data || [];
    coupons.value = rows.filter((c) => c.status === "unused");
  } catch {
    coupons.value = [];
  }
  try {
    hub.value = (await http.get("/me/wallet")).data || {};
  } catch {
    hub.value = {};
  }
}

function goLogin(redirect, tab) {
  const query = {};
  if (redirect) query.redirect = redirect;
  if (tab) query.tab = tab;
  router.push({ path: "/m/login", query });
}
function goAuth(path) {
  if (!store.token) goLogin(path);
  else router.push(path);
}
function goReferral() {
  if (!store.token) goLogin("/m/mine");
  else router.push(store.profile?.id ? "/m/user/" + store.profile.id : "/m/orders");
}
async function openAvatar() {
  if (!store.token) {
    goLogin("/m/mine");
    return;
  }
  picker.value = true;
  if (defaults.value.length) return;
  try {
    defaults.value = (await http.get("/avatars/defaults")).data || [];
  } catch {
    defaults.value = [];
  }
}
async function saveAvatar(url) {
  const res = await http.put("/me", { avatar: url });
  store.setAuth(store.token, res.data);
  picker.value = false;
}
async function onFile(e) {
  const file = (e.target.files || [])[0];
  e.target.value = "";
  if (!file) return;
  const body = new FormData();
  body.append("file", file);
  const up = await http.post("/upload", body);
  await saveAvatar(up.data.url);
}
function openMember() {
  if (!store.token) {
    goLogin("/m/member");
    return;
  }
  router.push("/m/member");
}
</script>
