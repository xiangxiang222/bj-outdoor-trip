<template>
  <div>
    <div v-if="store.token && store.profile" class="card" style="background:linear-gradient(135deg,#1b4332,#40916c);color:#fff">
      <div class="pad">
        <div class="row">
          <div>
            <div style="font-size:20px;font-weight:700">{{ store.profile.nickname }}</div>
            <div style="opacity:.85">{{ store.profile.phone || "未绑定手机" }}</div>
          </div>
          <span class="tag" style="background:#ffd166;color:#1b4332">{{ store.profile.isMember ? "会员" : "普通用户" }}</span>
        </div>
        <div class="row" style="margin-top:16px">
          <div>积分 {{ store.profile.points }}</div>
          <div v-if="store.profile.isMember">有效期 {{ store.profile.memberExpireAt }}</div>
        </div>
      </div>
    </div>
    <div v-else class="card"><div class="pad">
      <p style="margin-top:0">登录后可报名、开团、查看会员价和积分。</p>
      <button class="btn block" @click="goLogin()">登录</button>
      <button class="btn ghost block" style="margin-top:8px" @click="goLogin('', 'register')">注册</button>
    </div></div>

    <div v-if="upcoming.length" class="card" @click="$router.push('/m/schedule/' + upcoming[0].scheduleId)">
      <div class="pad">
        <div class="muted">即将出行</div>
        <strong>{{ upcoming[0].title }}</strong>
        <p class="muted" style="margin:6px 0 0">{{ upcoming[0].startDate }} · {{ upcoming[0].meetupPoint }} {{ upcoming[0].meetupTime }}</p>
      </div>
    </div>

    <div class="card" v-if="store.token && store.profile" @click="$router.push('/m/user/' + store.profile.id)"><div class="pad">个人主页 · 相册与行程</div></div>
    <div class="card" @click="goAuth('/m/orders')"><div class="pad">我的报名</div></div>
    <div class="card" @click="goAuth('/m/coupons')">
      <div class="pad">
        <div>我的优惠券<template v-if="coupons.length"> {{ coupons.length }} 张可用</template></div>
        <p v-if="coupons.length" class="muted" style="margin:6px 0 0">{{ coupons[0].label }} · {{ coupons[0].routeTitle }}</p>
      </div>
    </div>
    <div class="card" @click="goAuth('/m/favorites')"><div class="pad">我的收藏</div></div>
    <div class="card" @click="goReferral"><div class="pad">推荐报名 · 按人数结 5%</div></div>
    <div class="card" @click="openMember"><div class="pad">{{ store.profile?.isMember ? "会员中心" : "开通会员" }}</div></div>
    <div class="card" @click="$router.push('/m/routes')"><div class="pad">去选线路开团</div></div>
    <button v-if="store.token" class="btn ghost block" @click="store.logout(); $router.replace('/m/mine')">退出登录</button>
    <button v-if="store.token" class="btn ghost block" style="color:var(--clay);margin-top:8px" @click="closeAccount">注销账号</button>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";

const store = useUserStore();
const router = useRouter();
const opening = ref(false);
const upcoming = ref([]);
const coupons = ref([]);
onMounted(async () => {
  await store.fetchMe().catch(() => {});
  if (!store.token) return;
  try {
    upcoming.value = (await http.get("/me/trips")).data || [];
  } catch {
    upcoming.value = [];
  }
  try {
    const rows = (await http.get("/me/coupons")).data || [];
    coupons.value = rows.filter((c) => c.status === "unused");
  } catch {
    coupons.value = [];
  }
});

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
async function openMember() {
  if (!store.token) {
    goLogin("/m/member");
    return;
  }
  if (store.profile?.isMember) {
    router.push("/m/member");
    return;
  }
  if (opening.value) return;
  opening.value = true;
  try {
    const res = await http.post("/member/buy");
    store.setAuth(store.token, res.data.user);
    router.push("/m/member");
  } catch (e) {
    window.alert(e.message || "开通失败");
  } finally {
    opening.value = false;
  }
}
async function closeAccount() {
  if (!window.confirm("注销后账号信息将被删除，未出行的报名会取消。同一手机号可以重新注册。确定注销？")) return;
  try {
    await http.delete("/me");
    store.logout();
    router.replace("/m/mine");
  } catch (e) {
    window.alert(e.message || "注销失败");
  }
}
</script>
