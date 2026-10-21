<template>
  <div class="mine-page">
    <template v-if="store.token && store.profile">
      <div class="mine-head">
        <div class="mine-user">
          <button class="mine-avatar" type="button" @click="openAvatar">
            <img v-if="store.profile.avatar" :src="store.profile.avatar" alt="" />
            <span v-else>{{ (store.profile.nickname || "友").slice(0, 1) }}</span>
          </button>
          <div class="mine-user-main">
            <button type="button" class="mine-name-hit" @click="$router.push('/m/user/' + store.profile.id)">
              <div class="mine-name">{{ store.profile.nickname }}</div>
            </button>
            <div class="mine-tags">
              <button v-if="store.profile.membership" class="mine-lv" type="button" @click="openMember">{{ store.profile.membership.code }}</button>
              <button class="mine-chip" type="button" @click="openMember">会员 ›</button>
            </div>
          </div>
        </div>
        <div class="mine-tools">
          <button class="mine-tool" type="button" @click="$router.push('/m/official')">
            <span class="mine-tool-ico"><MineGlyph name="headset" /></span>
            <span>客服</span>
          </button>
          <button class="mine-tool" type="button" @click="goAuth('/m/settings')">
            <span class="mine-tool-ico"><MineGlyph name="hex" /></span>
            <span>设置</span>
          </button>
          <button class="mine-tool" type="button" @click="goAuth('/m/notices')">
            <span class="mine-tool-ico">
              <MineGlyph name="bubble" />
              <em v-if="hub.unreadCount" class="mine-badge">{{ hub.unreadCount > 9 ? "9+" : hub.unreadCount }}</em>
            </span>
            <span>消息</span>
          </button>
        </div>
      </div>

      <div class="mine-sheet">
        <div class="mine-sheet-head">
          <button type="button" @click="goAuth('/m/wallet')">我的钱包 ›</button>
          <button class="mine-member-banner" type="button" @click="openMember">会员中心 ›</button>
        </div>
        <div class="mine-stats">
          <button type="button" @click="goAuth('/m/wallet')">
            <b>{{ hub.balance ?? store.profile.walletBalance ?? 0 }}</b>
            <span>余额</span>
          </button>
          <button type="button" @click="goAuth('/m/coupons')">
            <b>{{ hub.couponCount || coupons.length || 0 }}</b>
            <span>优惠券</span>
            <em v-if="hub.couponExpireHint">{{ hub.couponExpireHint }}</em>
          </button>
          <button type="button" @click="goAuth('/m/signin')">
            <b>{{ hub.points ?? store.profile.points ?? 0 }}</b>
            <span>积分</span>
          </button>
          <button type="button" @click="goAuth('/m/signin')">
            <b>{{ hub.signedToday ? "已签到" : "去签" }}</b>
            <span>签到</span>
          </button>
          <button class="mine-more" type="button" @click="goAuth('/m/wallet')">更多</button>
        </div>
      </div>

      <div class="mine-orders">
        <div class="mine-links">
          <button type="button" @click="goAuth('/m/views')">
            <span>足迹</span>
            <b>{{ hub.viewCount || 0 }}</b>
          </button>
          <button type="button" @click="goAuth('/m/favorites')">
            <span>收藏</span>
            <b>{{ hub.favoriteCount || 0 }}</b>
          </button>
          <button type="button" @click="goAuth('/m/follows')">
            <span>关注</span>
            <b>{{ hub.followCount || 0 }}</b>
          </button>
        </div>
        <div class="mine-order-row">
          <div class="mine-shortcuts">
            <button type="button" @click="goOrders('unpaid')">
              <span class="mine-order-ico">
                <MineGlyph name="card" />
                <em v-if="hub.unpaidCount" class="mine-badge">{{ hub.unpaidCount > 99 ? "99+" : hub.unpaidCount }}</em>
              </span>
              <span>待付款</span>
            </button>
            <button type="button" @click="goOrders('recruiting')">
              <span class="mine-order-ico">
                <MineGlyph name="people" />
                <em v-if="hub.recruitingCount" class="mine-badge">{{ hub.recruitingCount > 99 ? "99+" : hub.recruitingCount }}</em>
              </span>
              <span>待成团</span>
            </button>
            <button type="button" @click="goOrders('depart')">
              <span class="mine-order-ico">
                <MineGlyph name="cube" />
                <em v-if="hub.departCount" class="mine-badge">{{ hub.departCount > 99 ? "99+" : hub.departCount }}</em>
              </span>
              <span>待出行</span>
            </button>
            <button type="button" @click="goOrders('review')">
              <span class="mine-order-ico">
                <MineGlyph name="smile" />
                <em v-if="hub.reviewCount" class="mine-badge">{{ hub.reviewCount > 99 ? "99+" : hub.reviewCount }}</em>
              </span>
              <span>待评价</span>
            </button>
            <button type="button" @click="goOrders('refund')">
              <span class="mine-order-ico">
                <MineGlyph name="yen" />
                <em v-if="hub.refundCount" class="mine-badge">{{ hub.refundCount > 99 ? "99+" : hub.refundCount }}</em>
              </span>
              <span>已退款</span>
            </button>
          </div>
          <button class="mine-all" type="button" @click="goOrders('all')">
            <span class="mine-order-ico"><i class="mine-all-ico"></i></span>
            <span>全部</span>
          </button>
        </div>
      </div>

      <div class="mine-play">
        <button type="button" @click="goAuth('/m/student')">
          <span class="mine-ico"><MineGlyph name="cap" /></span>
          <span class="mine-play-name">{{ campusShort }}</span>
        </button>
        <button type="button" @click="goAuth('/m/leader')">
          <span class="mine-ico"><MineGlyph name="peak" /></span>
          <span class="mine-play-name">{{ leaderShort }}</span>
        </button>
        <button type="button" @click="goAuth('/m/photo-apply')">
          <span class="mine-ico"><i class="mine-cam"></i></span>
          <span class="mine-play-name">摄影师申请</span>
        </button>
        <button type="button" @click="openPoster">
          <span class="mine-ico"><i class="mine-poster"></i></span>
          <span class="mine-play-name">生成海报</span>
        </button>
        <button type="button" @click="goAuth('/m/feedback')">
          <span class="mine-ico"><MineGlyph name="bubble" /></span>
          <span class="mine-play-name">反馈</span>
        </button>
      </div>
    </template>

    <div v-else class="card">
      <div class="pad">
        <p style="margin-top:0">登录后可报名、开团，余额也能用来付团费和提现。</p>
        <button class="btn block" type="button" @click="goLogin()">登录</button>
        <button class="btn ghost block" type="button" style="margin-top:8px" @click="goLogin('', 'register')">注册</button>
      </div>
    </div>

    <p v-if="picks.length" class="cell-label">路线推荐</p>
    <div class="mine-rec" v-if="picks.length">
      <button v-for="item in picks" :key="item.id" type="button" @click="$router.push('/m/route/' + item.id)">
        <img v-if="item.cover" :src="item.cover" alt="" />
        <span v-else class="mine-rec-ph">{{ (item.title || "线").slice(0, 1) }}</span>
        <strong>{{ item.title }}</strong>
        <b v-if="item.fromPrice != null"><span>¥</span>{{ item.fromPrice }}</b>
      </button>
    </div>

    <p class="cell-label">服务</p>
    <div class="cell-group">
      <button class="cell" type="button" @click="goAuth('/m/group')">
        <span>{{ groupLabel }}</span><i>›</i>
      </button>
      <button class="cell" type="button" @click="$router.push({ path: '/m', query: { view: 'routes' } })">
        <span>看线路</span><i>官方目的地 ›</i>
      </button>
    </div>

    <div v-if="posterPick" class="moments-mask" @click.self="posterPick = false" @touchmove.self.prevent>
      <div class="moments-sheet poster-pick" role="dialog" aria-label="选择团">
        <p class="poster-pick-title">选择要放进海报的团</p>
        <p class="poster-pick-hint">最多选 6 个团</p>
        <div class="poster-tools">
          <button type="button" :class="{ on: posterRange === 'all' }" @click="posterRange = 'all'">全部</button>
          <button type="button" :class="{ on: posterRange === 'week' }" @click="posterRange = 'week'">最近一周</button>
          <button type="button" :class="{ on: posterRange === 'month' }" @click="posterRange = 'month'">最近一个月</button>
          <button type="button" :class="{ on: posterRange === 'date' }" @click="posterRange = 'date'">指定日期</button>
        </div>
        <input v-if="posterRange === 'date'" v-model="posterDate" class="poster-date" type="date" />
        <input v-model="posterQuery" class="poster-search" type="search" placeholder="搜索团名、集合点" />
        <p v-if="posterLimit" class="poster-pick-limit">一张海报最多放 6 个团</p>
        <p v-if="posterLoading" class="muted">正在加载</p>
        <p v-else-if="!posterTrips.length" class="muted">还没有可以做成海报的团</p>
        <p v-else-if="posterRange === 'date' && !posterDate" class="muted">选一个出发日期</p>
        <p v-else-if="!posterView.length" class="muted">没有符合条件的团</p>
        <div v-else class="poster-pick-list">
          <button
            v-for="item in posterView"
            :key="item.id"
            type="button"
            class="poster-pick-row"
            :class="{ on: item.on }"
            @click="togglePoster(item)"
          >
            <i class="poster-pick-mark"></i>
            <span class="poster-pick-copy">
              <strong>{{ item.title }}</strong>
              <em>{{ item.when }}</em>
            </span>
          </button>
        </div>
        <div class="share-actions">
          <button class="btn" type="button" :disabled="!posterChosen" @click="makePoster">
            生成海报{{ posterCount ? " · " + posterCount : "" }}
          </button>
          <button class="btn ghost" type="button" @click="posterPick = false">关闭</button>
        </div>
      </div>
    </div>

    <div v-if="momentsOpen" class="moments-mask" @click.self="momentsOpen = false" @touchmove.self.prevent>
      <div class="moments-sheet" role="dialog" aria-label="朋友圈海报">
        <div class="moments-scroll">
          <img v-if="momentsUrl" :src="momentsUrl" alt="朋友圈海报" />
          <p v-else-if="momentsEmpty" class="muted">还没有可以做成海报的团</p>
          <p v-else class="muted">正在生成海报</p>
        </div>
        <p v-if="momentsUrl" class="muted moments-hint">长按图片保存，再发到朋友圈</p>
        <div class="share-actions">
          <button class="btn" type="button" :disabled="!momentsUrl" @click="savePoster">保存图片</button>
          <button class="btn ghost" type="button" @click="momentsOpen = false">关闭</button>
        </div>
      </div>
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
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import MineGlyph from "@/components/MineGlyph.vue";
import { useUserStore } from "@/stores/user";
import { processFeed } from "@/utils/feedList";
import { maskPhone } from "@/utils/labels";
import { buildLineup, drawLineupPoster } from "@/utils/momentsPoster";
import { downloadPosterPng } from "@/utils/sharePoster";

const store = useUserStore();
const router = useRouter();
const coupons = ref([]);
const hub = ref({});
const picker = ref(false);
const defaults = ref([]);
const picks = ref([]);
const momentsOpen = ref(false);
const momentsUrl = ref("");
const momentsEmpty = ref(false);
const posterPick = ref(false);
const posterTrips = ref([]);
const posterLoading = ref(false);
const posterLimit = ref(false);
const posterRange = ref("all");
const posterDate = ref("");
const posterQuery = ref("");
let posterRows = [];
let momentsCanvas = null;
const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const posterChosen = computed(() => posterTrips.value.some((row) => row.on));
const posterCount = computed(() => posterTrips.value.filter((row) => row.on).length);
const posterView = computed(() => posterTrips.value.filter((item) => inPosterRange(item.date, posterRange.value, posterDate.value) && fuzzyHit(item.blob, posterQuery.value)));

watch([posterPick, momentsOpen], ([picking, open]) => {
  document.body.style.overflow = picking || open ? "hidden" : "";
});
onUnmounted(() => {
  document.body.style.overflow = "";
});

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

onMounted(() => {
  load();
  loadPicks();
});

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
async function loadPicks() {
  try {
    const rows = (await http.get("/routes")).data || [];
    const ranked = rows.slice().sort((a, b) => (b.upcoming?.length || 0) - (a.upcoming?.length || 0));
    const withCover = ranked.filter((r) => r.cover);
    picks.value = (withCover.length >= 4 ? withCover : ranked).slice(0, 6);
  } catch {
    picks.value = [];
  }
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
function posterBlob(row) {
  const route = row.route || {};
  return [route.title, route.subtitle, route.category, route.region, route.difficulty, row.meetupPoint, row.city].filter(Boolean).join(" ");
}
function fuzzyHit(text, query) {
  const hay = String(text || "").toLowerCase().replace(/\s+/g, "");
  const needle = String(query || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!needle) return true;
  let at = 0;
  for (let i = 0; i < hay.length && at < needle.length; i += 1) {
    if (hay[i] === needle[at]) at += 1;
  }
  return at === needle.length;
}
function dayStamp(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function inPosterRange(iso, range, picked) {
  if (!range || range === "all") return true;
  if (range === "date") return Boolean(picked) && iso === picked;
  const start = dayStamp(0);
  const end = dayStamp(range === "week" ? 6 : 29);
  return iso >= start && iso <= end;
}
function posterWhen(row) {
  const iso = String(row.startDate || "").slice(0, 10);
  const d = new Date(`${iso}T00:00:00`);
  const meet = String(row.meetupPoint || "").trim();
  if (Number.isNaN(d.getTime())) return [iso, meet].filter(Boolean).join(" · ");
  const md = `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")} ${WEEK[d.getDay()]}`;
  return meet ? `${md} · ${meet}` : md;
}
function posterId(row, index) {
  return row.id != null ? String(row.id) : `i${index}`;
}
async function openPoster() {
  posterPick.value = true;
  posterLoading.value = true;
  posterLimit.value = false;
  posterRange.value = "all";
  posterDate.value = "";
  posterQuery.value = "";
  posterTrips.value = [];
  posterRows = [];
  try {
    const rows = (await http.get("/schedules", { params: { channel: "trip" } })).data || [];
    const list = processFeed(rows, { channel: "trip", sort: "soon" })
      .filter((row) => row?.route && String(row.route.title || "").trim() && row.startDate);
    posterRows = list;
    posterTrips.value = list.map((row, index) => ({
      id: posterId(row, index),
      title: row.route.title,
      when: posterWhen(row),
      date: String(row.startDate || "").slice(0, 10),
      blob: posterBlob(row),
      on: false,
    }));
  } catch {
    posterPick.value = false;
  } finally {
    posterLoading.value = false;
  }
}
function togglePoster(item) {
  const onCount = posterTrips.value.filter((row) => row.on).length;
  if (!item.on && onCount >= 6) {
    posterLimit.value = true;
    return;
  }
  posterLimit.value = false;
  posterTrips.value = posterTrips.value.map((row) => (row.id === item.id ? { ...row, on: !row.on } : row));
}
async function makePoster() {
  const chosen = new Set(posterTrips.value.filter((row) => row.on).map((row) => row.id));
  const rows = posterRows.filter((row, index) => chosen.has(posterId(row, index)));
  if (!rows.length) return;
  posterPick.value = false;
  momentsOpen.value = true;
  momentsUrl.value = "";
  momentsEmpty.value = false;
  momentsCanvas = null;
  try {
    const model = buildLineup(rows);
    if (!model.count) {
      momentsEmpty.value = true;
      return;
    }
    const ids = rows.slice(0, 6).map((row) => Number(row.id)).filter((id) => id > 0);
    if (ids.length) {
      try {
        const saved = await http.post("/poster-lineups", { ids });
        model.qr = saved.data?.qr || "";
      } catch {
        model.qr = "";
      }
    }
    momentsCanvas = await drawLineupPoster(model);
    momentsUrl.value = momentsCanvas.toDataURL("image/png");
  } catch {
    momentsOpen.value = false;
  }
}
async function savePoster() {
  if (!momentsCanvas) return;
  await downloadPosterPng(momentsCanvas, "moments-lineup.png");
}
function openMember() {
  if (!store.token) {
    goLogin("/m/member");
    return;
  }
  router.push("/m/member");
}
</script>
