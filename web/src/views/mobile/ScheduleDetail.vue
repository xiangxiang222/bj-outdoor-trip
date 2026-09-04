<template>
  <div v-if="s">
    <div class="card">
      <div class="hero-swipe" v-if="gallery.length" @click="previewHero">
        <img :src="gallery[heroIndex]" :alt="s.route.title" />
        <div class="hero-dots" v-if="gallery.length > 1">
          <i v-for="(g, i) in gallery" :key="g" :class="{ on: i === heroIndex }" />
        </div>
      </div>
      <div class="pad">
        <div class="row">
          <strong>
            <span v-if="s.offerLabel" class="offer-chip inline" :style="{ background: s.offerColor }">{{ s.offerLabel }}</span>
            {{ s.route.title }}
          </strong>
          <span class="tag">{{ statusTag }}</span>
        </div>
        <div class="tag-row">
          <span class="play-tag sm" v-for="t in s.playTags || s.route.tags || []" :key="t.id || t" :style="{ background: t.color || '#2d6a4f' }">{{ t.name || t }}</span>
        </div>
        <p class="muted">{{ s.startDate }} {{ s.endDate !== s.startDate ? "至 " + s.endDate : "" }}</p>
        <p>
          <a v-if="busPhotos.length" class="nav-link" href="#" @click.prevent="showBus = true">{{ busText }}</a>
          <span v-else>{{ busText }}</span>
        </p>
        <p>
          集合：{{ s.meetupPoint }} {{ s.meetupTime }}
          <a v-if="s.meetupMapUrl" class="nav-link" :href="s.meetupMapUrl" target="_blank" rel="noreferrer">打开地图</a>
        </p>
        <p v-if="s.guaranteed" class="muted" style="color:var(--leaf)">已成团 · 铁定出发（人数已达最低成团线）</p>
        <p>
          发起人：
          <a v-if="s.organizerId" class="nav-link" href="#" @click.prevent="goUser(s.organizerId)">{{ s.organizerName }}</a>
          <span v-else>{{ s.organizerName }}</span>
          <span v-if="s.companyName">（{{ s.companyName }}）</span>
        </p>
        <div class="progress"><i :style="{ width: Math.min(100, (s.enrolled / s.maxSeats) * 100) + '%' }"></i></div>
        <div class="row">
          <span>已报名 {{ s.enrolled }}/{{ s.maxSeats }}，最低成团 {{ s.minGroupSize }}<template v-if="s.waitlistCount"> · 候补 {{ s.waitlistCount }}</template></span>
          <TripPrices :quote="s.quote" compact />
        </div>
        <p class="muted" v-if="s.reviewStatus === 'pending'" style="color:#c77d3a">本团正在审核，通过后才会出现在首页，暂不能报名。</p>
        <p class="muted" v-else-if="s.reviewStatus === 'rejected'" style="color:var(--clay)">本团未通过审核。</p>
        <p class="muted" v-if="s.status === 'cancelled'" style="color:var(--clay)">
          本团已解散。理由：{{ s.cancelReason }}
        </p>
        <div v-if="s.coupon" class="card" style="margin:12px 0 0;background:#fff7e6" @click="$router.push('/m/coupon/' + s.coupon.code)">
          <div class="pad">
            <strong>{{ s.coupon.label }}</strong>
            <span class="muted"> 余 {{ s.coupon.remain }}/{{ s.coupon.total }} · 点此领取</span>
          </div>
        </div>
        <div class="leader-board">
          <div class="leader-slot" v-for="slot in leaderSlots" :key="slot.slot">
            <template v-if="slot.leader">
              <a class="nav-link" href="#" @click.prevent="openLeader(slot.leader)">
                <img v-if="slot.leader.avatar" class="leader-face" :src="slot.leader.avatar" alt="" />
                <span v-else class="leader-face">{{ (slot.leader.name || "领").slice(0, 1) }}</span>
                {{ slot.label }} {{ slot.leader.name }}
              </a>
            </template>
            <a v-else class="nav-link" href="#" @click.prevent="applyLeader(slot.slot)">{{ slot.label }} · 报名领队</a>
          </div>
          <p class="muted">{{ s.leaderRecruitCopy }}</p>
        </div>
        <div v-if="weather" class="weather" :class="weather.alerts?.[0]?.level">
          <strong>{{ weather.place }} {{ weather.summary }}</strong>
          <span>{{ weather.tmin }}~{{ weather.tmax }}℃ · 风 {{ weather.wind }}km/h</span>
          <WeatherChart :hourly="weather.hourly" :label="weather.place + '分时气温'" />
          <p v-for="(a, i) in weather.alerts" :key="i">{{ a.text }}</p>
        </div>
      </div>
    </div>

    <div class="h2">座位图</div>
    <div class="card"><div class="pad">
      <div class="seat-map">
        <div class="seat-front">车头</div>
        <div class="seat-row" v-for="row in seatRows" :key="row[0].row">
          <template v-for="seat in row" :key="seat.no">
            <span
              class="seat"
              :class="{ taken: seat.taken && !seat.locked, locked: seat.locked, mine: seat.mine, face: !!seat.occupant }"
              @click="onSeat(seat)"
            >
              <img v-if="seat.occupant?.avatar" :src="seat.occupant.avatar" alt="" />
              <template v-else-if="seat.occupant">{{ seat.occupant.initial }}<span class="seat-age">{{ genderMark(seat.occupant.gender) }}{{ seat.occupant.lifeStage }}</span></template>
              <template v-else-if="seat.locked">锁</template>
              <template v-else>{{ seat.col }}</template>
            </span>
            <i v-if="seat.aisleAfter" class="seat-aisle" />
          </template>
        </div>
      </div>
      <p class="muted">{{ seatHint }}</p>
    </div></div>

    <div class="h2" v-if="s.myEnrollment">报名后</div>
    <div class="card" v-if="s.myEnrollment"><div class="pad">
      <p>1. 座位图可改座，早报名早选座。</p>
      <p>2. 本团微信群</p>
      <img v-if="s.consultGroupQr" :src="s.consultGroupQr" alt="本团群二维码" style="width:140px;height:140px;background:#fff;border-radius:12px" />
      <p class="muted">{{ s.consultGroup || contacts.officialWechat }}</p>
      <p>3. 候选团（本团未成团则按顺序转团，价格多退少补）</p>
      <label class="check-row" v-for="opt in candidateOptions" :key="opt.id">
        <input type="checkbox" :value="opt.id" v-model="fallbackIds" />
        <span>{{ opt.title }} {{ opt.startDate }} · 余 {{ opt.remain }}</span>
      </label>
      <p>4. 替代团</p>
      <label class="check-row">
        <input type="checkbox" v-model="autoAlt" />
        <span>如本团未成团，自动加入相同行程的其他日期</span>
      </label>
      <button class="btn ghost block" style="margin-top:8px" :disabled="savingFallbacks" @click="saveFallbacks">保存备选</button>
      <button v-if="s.myEnrollment.status === 'joined'" class="btn block" type="button" style="margin-top:8px" @click="$router.push('/m/after/' + s.id)">完成活动 / 评选</button>
    </div></div>

    <div class="h2">推荐报名</div>
    <div class="card"><div class="pad" style="text-align:center">
      <p class="muted">推荐成功后按人数结算报名费的 5%</p>
      <img v-if="referral.qr" :src="referral.qr" alt="推荐二维码" style="width:160px;height:160px;background:#fff;border-radius:12px" />
      <p class="muted" style="word-break:break-all">{{ referral.url }}</p>
      <p v-if="referral.code">我的推荐码 {{ referral.code }} · 待结 ¥{{ referral.pending || 0 }} / 已结 ¥{{ referral.earned || 0 }}</p>
      <button class="btn ghost" @click="loadReferral">生成我的推荐码</button>
    </div></div>

    <div class="h2">报名名单</div>
    <div class="card"><div class="pad">
      <div class="chain-item" v-for="c in s.chain" :key="c.index">
        <span>{{ c.index }}</span>
        <span>
          <a v-if="c.userId" class="nav-link" href="#" @click.prevent="goUser(c.userId)">{{ c.name }}</a>
          <span v-else>{{ c.name }}</span>
          {{ c.gender === "female" ? "女" : c.gender === "male" ? "男" : "" }}
          <span v-if="c.lifeStage" class="muted"> · {{ c.lifeStage }}</span>
        </span>
        <span v-if="c.waitlisted" class="muted">候补</span>
        <span
          v-else
          :class="{ 'pay-paid': c.payStatus === 'paid', 'pay-unpaid': c.canPay }"
          @click="c.canPay && payFor(c)"
        >{{ (c.seatNo ? c.seatNo + " · " : "") + payText(c.payStatus) }}{{ c.canPay ? " · 去支付" : "" }}</span>
      </div>
      <p class="muted" v-if="!s.chain?.length">还没有人报名，快来占第一名。</p>
    </div></div>

    <div class="h2">本团评价 <span v-if="reviews.count" class="muted">{{ reviews.avg }} 分 · {{ reviews.count }} 条</span></div>
    <div class="card" v-if="reviews.list?.length">
      <div class="pad review-item" v-for="rv in reviews.list" :key="rv.id">
        <div class="row">
          <strong>{{ rv.name }}</strong>
          <span class="stars">{{ starText(rv.rating) }}</span>
        </div>
        <p v-if="rv.content">{{ rv.content }}</p>
        <p class="muted">{{ rv.createdAt }}</p>
      </div>
    </div>
    <p class="muted" v-else>还没有评价。</p>

    <div class="h2">装备清单</div>
    <div class="card"><div class="pad">
      <label class="pack-item" v-for="item in packing" :key="item">
        <input type="checkbox" />
        <span>{{ item }}</span>
      </label>
      <p class="muted" v-if="!packing.length">详见线路介绍中的装备说明。</p>
    </div></div>

    <div class="h2">退改说明</div>
    <div class="card"><div class="pad">
      <p class="muted" style="margin-top:0">{{ cancelPolicy.summary }}</p>
      <p v-for="(it, i) in cancelPolicy.items" :key="i" class="muted">{{ i + 1 }}. {{ it }}</p>
    </div></div>

    <div class="h2">联系官方与本团</div>
    <div class="card"><div class="pad">
      <div class="contact-row">
        <span>官方微信 {{ contacts.officialWechatName }} <em class="muted">{{ contacts.officialWechat }}</em></span>
        <a class="nav-link" href="#" @click.prevent="copyText(contacts.officialWechat)">复制</a>
      </div>
      <div class="contact-row">
        <span>官方用户群 {{ contacts.officialGroup }}</span>
        <a class="nav-link" href="#" @click.prevent="copyText(contacts.officialWechat)">复制微信号</a>
      </div>
      <div class="contact-row" v-if="s.consultGroup">
        <span>本团咨询群 {{ s.consultGroup }}</span>
        <a class="nav-link" href="#" @click.prevent="copyText(s.consultGroup)">复制</a>
      </div>
      <p class="muted" v-else>本团咨询群确认后会显示在这里。</p>
      <p class="muted">{{ contacts.hint }}</p>
    </div></div>

    <div style="display:flex;gap:8px;margin:12px 0">
      <button class="btn ghost" style="flex:1" @click="$router.push('/m/stats/' + s.id)">本团画像</button>
      <button class="btn ghost" style="flex:1" @click="share">分享到微信</button>
    </div>
    <button v-if="s.status !== 'cancelled' && s.reviewStatus !== 'pending' && s.reviewStatus !== 'rejected'" class="btn block clay" @click="$router.push(enrollHref)">
      {{ s.canEnrollDirect === false && s.remain <= 0 ? "已满员，去候补" : "立即报名" }}
    </button>
    <button v-if="isOwner && s.organizerType === 'company' && s.status !== 'cancelled'" class="btn block" style="margin-top:8px" @click="settle">公司统一微信支付</button>
    <button v-if="s.isOrganizer && s.status !== 'cancelled'" class="btn ghost block" style="margin-top:8px;color:var(--clay)" @click="showDissolve = true">解散拼团</button>
    <p class="muted" style="margin-top:8px">{{ s.notes }}</p>
    <p v-if="msg" class="muted">{{ msg }}</p>

    <div v-if="showShare" class="card" style="margin-top:12px">
      <div class="pad" style="text-align:center">
        <p style="margin-top:0">发给微信好友或群，扫码即可打开本团报名页</p>
        <img v-if="shareQr" :src="shareQr" alt="报名二维码" style="width:180px;height:180px;background:#fff;border-radius:12px" />
        <p class="muted" style="word-break:break-all">{{ shareUrl }}</p>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn ghost" style="flex:1" @click="showShare = false">关闭</button>
          <button class="btn" style="flex:1" @click="copyShare">复制链接</button>
        </div>
      </div>
    </div>

    <div v-if="showDissolve" class="card" style="margin-top:12px">
      <div class="pad">
        <p>解散后将取消全部报名，已付款的标记退款，并向出行人发送取消短信。</p>
        <label>解散理由</label>
        <textarea class="input" v-model="reason" rows="3" placeholder="例如：天气预警、人数不足不成团" />
        <p v-if="dissolveErr" style="color:var(--clay)">{{ dissolveErr }}</p>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn ghost" style="flex:1" @click="showDissolve = false">取消</button>
          <button class="btn clay" style="flex:1" :disabled="dissolving" @click="dissolve">确认解散</button>
        </div>
      </div>
    </div>

    <div v-if="showBus" class="lightbox" @click.self="showBus = false">
      <img :src="busPhotos[busPhotoIndex]" alt="用车照片" @click.stop="busPhotoIndex = (busPhotoIndex + 1) % busPhotos.length" />
      <div class="lb-nav">
        <button class="lb-btn" type="button" @click.stop="showBus = false">关闭</button>
      </div>
      <div class="lb-hint">{{ busText }} · 点击图片可切换</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { payStatusText, scheduleStatusText, starText } from "@/utils/labels";
import WeatherChart from "@/components/WeatherChart.vue";
import TripPrices from "@/components/TripPrices.vue";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const s = ref(null);
const msg = ref("");
const showDissolve = ref(false);
const showShare = ref(false);
const showBus = ref(false);
const shareUrl = ref("");
const shareQr = ref("");
const shareText = ref("");
const reason = ref("");
const dissolveErr = ref("");
const dissolving = ref(false);
const weather = ref(null);
const reviews = ref({ list: [], count: 0, avg: 0 });
const cancelPolicy = ref({ summary: "", items: [] });
const contacts = ref({ officialWechat: "beiyexing", officialWechatName: "北野行官方", officialGroup: "北野行户外交流群", hint: "" });
const packing = computed(() => s.value?.route?.packingList || []);
const referral = ref({});
const fallbackIds = ref([]);
const autoAlt = ref(false);
const savingFallbacks = ref(false);
const seatChart = ref(null);
const heroIndex = ref(0);
const busPhotoIndex = ref(0);
let heroTimer = 0;
const gallery = computed(() => s.value?.gallery?.length ? s.value.gallery : (s.value?.route?.cover ? [s.value.route.cover] : []));
const enrollHref = computed(() => {
  const q = new URLSearchParams();
  if (route.query.ref) q.set("ref", String(route.query.ref));
  if (route.query.coupon) q.set("coupon", String(route.query.coupon));
  const s = q.toString();
  return "/m/enroll/" + (route.params.id || "") + (s ? "?" + s : "");
});
const busPhotos = computed(() => s.value?.bus?.photos || []);
const busText = computed(() => {
  const b = s.value?.bus;
  if (!b) return "车型待确认";
  const bits = [b.name];
  if (b.seats) bits.push(b.seats + " 座");
  if (b.plateNo) bits.push(b.plateNo);
  else bits.push("车号待确认");
  return bits.join(" · ");
});
const seatRows = computed(() => {
  const list = seatChart.value?.seats || [];
  const groups = [];
  for (const seat of list) {
    const last = groups[groups.length - 1];
    if (!last || last[0].row !== seat.row) groups.push([seat]);
    else last.push(seat);
  }
  return groups;
});
const isOwner = computed(() => store.profile && s.value && Number(s.value.organizerId) === Number(store.profile.id));
const leaderSlots = computed(() => {
  const list = s.value?.leaders || [];
  return [1, 2].map((slot) => ({
    slot,
    label: `领队${slot}`,
    leader: list.find((l) => Number(l.slot) === slot) || null,
  }));
});
const candidateOptions = computed(() => {
  const opts = s.value?.fallbackOptions || {};
  return [...(opts.sameRoute || []), ...(opts.otherRecruiting || [])];
});
const seatHint = computed(() => {
  if (s.value?.myEnrollment?.status === "joined") return "点空位即可改座。占用位显示性别与年龄段。";
  return "早报名早选座。报名前点空位会提示先报名；占用位可看个人主页。";
});
const statusTag = computed(() => {
  if (!s.value) return "";
  if (s.value.status === "cancelled") return scheduleStatusText("cancelled");
  return s.value.organizerType === "company" ? "公司统一支付" : "先报名后付款";
});

onMounted(() => {
  load();
  heroTimer = window.setInterval(() => {
    if (gallery.value.length > 1) heroIndex.value = (heroIndex.value + 1) % gallery.value.length;
  }, 4000);
});
onUnmounted(() => {
  if (heroTimer) window.clearInterval(heroTimer);
});

async function load() {
  s.value = (await http.get("/schedules/" + route.params.id)).data;
  heroIndex.value = 0;
  fallbackIds.value = (s.value.myEnrollment?.fallbacks || []).map((f) => f.id);
  autoAlt.value = !!s.value.myEnrollment?.autoAlt;
  try {
    seatChart.value = (await http.get("/schedules/" + route.params.id + "/seats")).data;
  } catch {
    seatChart.value = null;
  }
  try {
    const region = [s.value.route?.region, s.value.route?.title].filter(Boolean).join(" ");
    weather.value = (await http.get("/weather", { params: { region, date: s.value.startDate } })).data;
  } catch {
    weather.value = null;
  }
  try {
    reviews.value = (await http.get("/schedules/" + route.params.id + "/reviews")).data;
  } catch {
    reviews.value = { list: [], count: 0, avg: 0 };
  }
  try {
    const meta = (await http.get("/meta")).data;
    cancelPolicy.value = meta.cancelPolicy || cancelPolicy.value;
    if (meta.contacts) contacts.value = meta.contacts;
  } catch {
    /* ignore */
  }
}

function payText(st) {
  return payStatusText(st);
}

function genderMark(g) {
  return g === "female" ? "女" : g === "male" ? "男" : "";
}

function goUser(id) {
  if (id) router.push("/m/user/" + id);
}

function onSeat(seat) {
  if (seat.occupant?.userId) {
    goUser(seat.occupant.userId);
    return;
  }
  if (seat.locked || seat.taken) return;
  if (s.value?.myEnrollment?.status === "joined") {
    pickSeat(seat.no);
    return;
  }
  msg.value = "早报名早选座";
}

async function pickSeat(seatNo) {
  try {
    await http.post("/schedules/" + s.value.id + "/seats/pick", { seatNo });
    msg.value = "已选 " + seatNo;
    await load();
  } catch (e) {
    msg.value = e.message;
  }
}

function openLeader(leader) {
  if (leader.kind === "guide") router.push("/m/guide/" + leader.id);
  else if (leader.userId || leader.id) router.push("/m/user/" + (leader.userId || leader.id));
}

async function applyLeader() {
  if (!store.token) {
    router.push("/m/login?redirect=" + encodeURIComponent(route.fullPath));
    return;
  }
  try {
    const res = await http.post("/schedules/" + s.value.id + "/leaders/apply", { leadRef: route.query.leadRef });
    msg.value = res.message || "已报名领队";
    await load();
  } catch (e) {
    msg.value = e.message;
  }
}

async function saveFallbacks() {
  if (!s.value?.myEnrollment) return;
  savingFallbacks.value = true;
  try {
    await http.post("/enrollments/" + s.value.myEnrollment.id + "/fallbacks", {
      scheduleIds: fallbackIds.value,
      autoAlt: autoAlt.value,
    });
    msg.value = "已保存候选团 / 替代团";
    await load();
  } catch (e) {
    msg.value = e.message;
  } finally {
    savingFallbacks.value = false;
  }
}

async function loadReferral() {
  if (!store.token) {
    router.push("/m/login?redirect=" + encodeURIComponent(route.fullPath));
    return;
  }
  try {
    referral.value = (await http.get("/me/referral", { params: { scheduleId: s.value.id } })).data || {};
  } catch (e) {
    msg.value = e.message;
  }
}

function previewHero() {
  if (gallery.value.length > 1) heroIndex.value = (heroIndex.value + 1) % gallery.value.length;
}

async function payFor(c) {
  if (!store.token) {
    router.push("/m/login?redirect=" + encodeURIComponent(route.fullPath));
    return;
  }
  try {
    await http.post("/pay/for-enrollment", { enrollmentId: c.enrollmentId });
    msg.value = "已为 " + c.name + " 完成支付（演示）";
    await load();
  } catch (e) {
    msg.value = e.message;
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    msg.value = "已复制";
  } catch {
    msg.value = text;
  }
}

async function share() {
  const url = location.origin + "/m/schedule/" + s.value.id + "?token=" + (s.value.shareToken || "");
  shareUrl.value = url;
  shareText.value = `${s.value.organizerName}邀请你参加「${s.value.route.title}」${s.value.startDate}出发，已有${s.value.enrolled}人报名：${url}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "北野行 · " + s.value.route.title, text: shareText.value, url });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  shareQr.value = "";
  showShare.value = true;
  try {
    const res = await http.get(`/schedules/${s.value.id}/poster`);
    shareQr.value = res.data.qr;
    if (res.data.url) shareUrl.value = res.data.url;
  } catch {
    /* 二维码失败时仍可复制链接 */
  }
}

async function copyShare() {
  try {
    await navigator.clipboard.writeText(shareText.value || shareUrl.value);
    msg.value = "链接已复制，打开微信发给好友或群即可";
  } catch {
    msg.value = "请长按链接复制";
  }
}

async function settle() {
  const res = await http.post("/pay/company-settle", { scheduleId: s.value.id });
  msg.value = `已为 ${res.data.count} 人统一支付，合计 ¥${res.data.total}`;
  await load();
}

async function dissolve() {
  dissolveErr.value = "";
  if (!reason.value.trim()) {
    dissolveErr.value = "请填写解散理由";
    return;
  }
  dissolving.value = true;
  try {
    const res = await http.post(`/schedules/${s.value.id}/dissolve`, { reason: reason.value.trim() });
    showDissolve.value = false;
    msg.value = `已解散，取消 ${res.data.cancelled} 人，退款 ${res.data.refunded} 人，短信 ${res.data.smsCount} 条`;
    await load();
  } catch (e) {
    dissolveErr.value = e.message;
  } finally {
    dissolving.value = false;
  }
}
</script>
