<template>
  <div v-if="s">
    <div class="card">
      <img class="cover" :src="s.route.cover" />
      <div class="pad">
        <div class="row">
          <strong>{{ s.route.title }}</strong>
          <span class="tag">{{ statusTag }}</span>
        </div>
        <p class="muted">{{ s.startDate }} {{ s.endDate !== s.startDate ? "至 " + s.endDate : "" }} · {{ s.bus?.name }}</p>
        <p>集合：{{ s.meetupPoint }} {{ s.meetupTime }}</p>
        <p>发起人：{{ s.organizerName }} <span v-if="s.companyName">（{{ s.companyName }}）</span></p>
        <div class="progress"><i :style="{ width: Math.min(100, (s.enrolled / s.maxSeats) * 100) + '%' }"></i></div>
        <div class="row">
          <span>已报名 {{ s.enrolled }}/{{ s.maxSeats }}，最低成团 {{ s.minGroupSize }}<template v-if="s.waitlistCount"> · 候补 {{ s.waitlistCount }}</template></span>
          <span class="price">¥{{ s.quote.price }}</span>
        </div>
        <p class="muted" v-if="s.status === 'cancelled'" style="color:var(--clay)">
          本团已解散。理由：{{ s.cancelReason }}
        </p>
        <p class="muted" v-else-if="s.guide">已成团，匹配导游：{{ s.guide.name }}（{{ s.guide.specialties }} · {{ s.guide.years }}年）</p>
        <p class="muted" v-else>人数达到最低成团后将自动匹配导游。</p>
      </div>
    </div>

    <div class="h2">座位图</div>
    <div class="card"><div class="pad">
      <div class="seat-map">
        <div class="seat-front">车头</div>
        <div class="seat-row" v-for="row in seatRows" :key="row[0].row">
          <template v-for="seat in row" :key="seat.no">
            <span class="seat" :class="{ taken: seat.taken, mine: seat.mine }">{{ seat.col }}</span>
            <i v-if="seat.aisleAfter" class="seat-aisle" />
          </template>
        </div>
      </div>
      <p class="muted">绿位已占用，中间为过道。</p>
    </div></div>

    <div class="h2">报名名单</div>
    <div class="card"><div class="pad">
      <div class="chain-item" v-for="c in s.chain" :key="c.index">
        <span>{{ c.index }}</span>
        <span>{{ c.name }} · {{ c.gender === "female" ? "女" : c.gender === "male" ? "男" : "" }}</span>
        <span class="muted">{{ c.waitlisted ? "候补" : (c.seatNo ? c.seatNo + " · " : "") + payText(c.payStatus) }}</span>
      </div>
      <p class="muted" v-if="!s.chain?.length">还没有人报名，快来占第一名。</p>
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
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { payStatusText, scheduleStatusText } from "@/utils/labels";

const route = useRoute();
const store = useUserStore();
const s = ref(null);
const msg = ref("");
const showDissolve = ref(false);
const showShare = ref(false);
const shareUrl = ref("");
const shareQr = ref("");
const shareText = ref("");
const reason = ref("");
const dissolveErr = ref("");
const dissolving = ref(false);
const seatChart = ref(null);
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

onMounted(load);

async function load() {
  s.value = (await http.get("/schedules/" + route.params.id)).data;
  try {
    seatChart.value = (await http.get("/schedules/" + route.params.id + "/seats")).data;
  } catch {
    seatChart.value = null;
  }
}

function payText(st) {
  return payStatusText(st);
}

async function share() {
  const url = location.origin + "/m/schedule/" + s.value.id + "?token=" + (s.value.shareToken || "");
  shareUrl.value = url;
  shareText.value = `${s.value.organizerName}邀请你参加「${s.value.route.title}」${s.value.startDate}出发，已有${s.value.enrolled}人报名：${url}`;
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
