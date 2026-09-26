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
        <div class="mine-tools">
          <button class="mine-tool" type="button" @click="$router.push('/m/official')">
            <span class="mine-tool-ico"><img :src="'/static/mine/tool-help.png'" alt="" /></span>
            <span>客服</span>
          </button>
          <button class="mine-tool" type="button" @click="goAuth('/m/settings')">
            <span class="mine-tool-ico"><img :src="'/static/mine/tool-set.png'" alt="" /></span>
            <span>设置</span>
          </button>
          <button class="mine-tool" type="button" @click="goAuth('/m/notices')">
            <span class="mine-tool-ico">
              <img :src="'/static/mine/tool-msg.png'" alt="" />
              <em v-if="hub.unreadCount" class="mine-badge">{{ hub.unreadCount > 9 ? "9+" : hub.unreadCount }}</em>
            </span>
            <span>消息</span>
          </button>
        </div>
      </div>

      <button v-if="store.profile.membership" class="mine-member" type="button" @click="openMember">
        <div>
          <strong class="mine-level"><em>{{ store.profile.membership.code }}</em>会员</strong>
          <span>本月累计新增 {{ store.profile.membership.monthGrowth }} 成长值</span>
        </div>
        <i class="mine-pill">会员中心 ›</i>
      </button>

      <div class="mine-shortcuts">
        <button type="button" @click="goOrders('unpaid')">
          <span class="mine-order-ico">
            <img :src="'/static/mine/order-pay.png'" alt="" />
            <em v-if="hub.unpaidCount" class="mine-badge">{{ hub.unpaidCount > 99 ? "99+" : hub.unpaidCount }}</em>
          </span>
          <span>待支付</span>
        </button>
        <button type="button" @click="goOrders('waitlist')">
          <span class="mine-order-ico">
            <img :src="'/static/mine/order-wait.png'" alt="" />
            <em v-if="hub.waitlistCount" class="mine-badge">{{ hub.waitlistCount > 99 ? "99+" : hub.waitlistCount }}</em>
          </span>
          <span>候补</span>
        </button>
        <button type="button" @click="goOrders('depart')">
          <span class="mine-order-ico">
            <img :src="'/static/mine/order-go.png'" alt="" />
            <em v-if="hub.departCount" class="mine-badge">{{ hub.departCount > 99 ? "99+" : hub.departCount }}</em>
          </span>
          <span>待出发</span>
        </button>
        <button type="button" @click="goOrders('review')">
          <span class="mine-order-ico">
            <img :src="'/static/mine/order-review.png'" alt="" />
            <em v-if="hub.reviewCount" class="mine-badge">{{ hub.reviewCount > 99 ? "99+" : hub.reviewCount }}</em>
          </span>
          <span>待评价</span>
        </button>
        <button type="button" @click="goOrders('refund')">
          <span class="mine-order-ico">
            <img :src="'/static/mine/order-refund.png'" alt="" />
            <em v-if="hub.refundCount" class="mine-badge">{{ hub.refundCount > 99 ? "99+" : hub.refundCount }}</em>
          </span>
          <span>退款</span>
        </button>
      </div>

      <button class="mine-wallet" type="button" @click="goAuth('/m/wallet')">
        <span class="mine-wallet-item">
          <img :src="'/static/mine/wal-coin.png'" alt="" />
          <strong>{{ hub.balance ?? store.profile.walletBalance ?? 0 }}</strong>
          <span>余额</span>
        </span>
        <span class="mine-wallet-item">
          <img :src="'/static/mine/wal-coupon.png'" alt="" />
          <strong>{{ hub.couponCount || coupons.length || 0 }}</strong>
          <span>优惠券</span>
          <em v-if="hub.couponExpireHint">{{ hub.couponExpireHint }}</em>
        </span>
        <span class="mine-wallet-item">
          <img :src="'/static/mine/wal-point.png'" alt="" />
          <strong>{{ store.profile.points || 0 }}</strong>
          <span>积分</span>
        </span>
        <span class="mine-wallet-item is-entry">
          <img :src="'/static/mine/wal-purse.png'" alt="" />
          <b>钱包</b>
        </span>
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
      <button type="button" @click="goAuth('/m/favorites')"><img :src="'/static/mine/fav.png'" alt="" />我的收藏</button>
      <button type="button" @click="goAuth('/m/views')"><img :src="'/static/mine/views.png'" alt="" />最近看过</button>
      <button type="button" @click="goAuth('/m/companions')"><img :src="'/static/mine/people.png'" alt="" />常用报名人</button>
      <button type="button" @click="goAuth('/m/follows')"><img :src="'/static/mine/follow.png'" alt="" />关注领队</button>
      <button type="button" @click="goAuth('/m/student')"><img :src="'/static/mine/campus.png'" alt="" />{{ campusShort }}</button>
      <button type="button" @click="goAuth('/m/leader')"><img :src="'/static/mine/leader.png'" alt="" />{{ leaderShort }}</button>
      <button type="button" @click="goAuth('/m/publish')"><img :src="'/static/mine/publish.png'" alt="" />去发团</button>
      <button type="button" @click="goReferral"><img :src="'/static/mine/referral.png'" alt="" />推荐报名</button>
      <button type="button" @click="goAuth('/m/lottery')"><img :src="'/static/mine/lottery.png'" alt="" />抽奖</button>
      <button type="button" @click="goAuth('/m/route-apply')"><img :src="'/static/mine/route.png'" alt="" />收录线路</button>
      <button type="button" @click="goAuth('/m/feedback')"><img :src="'/static/mine/feedback.png'" alt="" />建议反馈</button>
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
function goOrders(tab) {
  if (!store.token) goLogin("/m/orders?tab=" + tab);
  else router.push({ path: "/m/orders", query: { tab } });
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
