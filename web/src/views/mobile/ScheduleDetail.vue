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
          <strong>{{ s.route.title }}</strong>
          <span class="tag">{{ statusTag }}</span>
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
          <span class="price">¥{{ s.quote.price }}</span>
        </div>
        <p class="muted" v-if="s.status === 'cancelled'" style="color:var(--clay)">
          本团已解散。理由：{{ s.cancelReason }}
        </p>
        <p class="muted" v-else-if="s.guide">
          已成团，匹配导游：
          <a class="nav-link" href="#" @click.prevent="$router.push('/m/guide/' + s.guide.id)">{{ s.guide.name }} 查看详情</a>
          （{{ s.guide.specialties }} · {{ s.guide.years }}年）
        </p>
        <p class="muted" v-else>人数达到最低成团后将自动匹配导游。</p>
        <div v-if="weather" class="weather" :class="weather.alerts?.[0]?.level" @click="showHourly = !showHourly">
          <strong>{{ weather.place }} {{ weather.summary }}</strong>
          <span>{{ weather.tmin }}~{{ weather.tmax }}℃ · 风 {{ weather.wind }}km/h · 点看分时</span>
          <p v-for="(a, i) in weather.alerts" :key="i">{{ a.text }}</p>
          <div v-if="showHourly && weather.hourly?.length" class="hourly">
            <span v-for="h in weather.hourly" :key="h.hour">{{ h.hour }}<br />{{ h.temp }}℃<br />{{ h.summary }}</span>
          </div>
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
      <p class="muted">占用位显示性别与年龄段，点击可看个人主页。灰位为官方/导游锁定。</p>
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
    <button v-if="s.status !== 'cancelled'" class="btn block clay" @click="$router.push('/m/enroll/' + s.id)">
      {{ s.remain <= 0 ? "已满员，去候补" : "立即报名" }}
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

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const s = ref(null);
const msg = ref("");
const showDissolve = ref(false);
const showShare = ref(false);
const showBus = ref(false);
const showHourly = ref(false);
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
const seatChart = ref(null);
const heroIndex = ref(0);
const busPhotoIndex = ref(0);
let heroTimer = 0;
const gallery = computed(() => s.value?.gallery?.length ? s.value.gallery : (s.value?.route?.cover ? [s.value.route.cover] : []));
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
  if (seat.occupant?.userId) goUser(seat.occupant.userId);
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
