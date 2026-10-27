<template>
  <LoadRow v-if="!t && !err" />
  <div v-else-if="t" class="guide-traveler">
    <div class="card guide-traveler-intro">
      <div class="pad guide-row">
        <div class="guide-face" style="width:64px;height:64px;font-size: calc(22px * var(--ui-scale))">
          <img v-if="t.avatar" :src="t.avatar" :alt="t.name" />
          <span v-else>{{ (t.name || "客").slice(0, 1) }}</span>
        </div>
        <div>
          <span class="ops-eyebrow">TRAVELER PROFILE</span>
          <strong style="font-size: calc(18px * var(--ui-scale))">{{ t.name }}</strong>
          <p class="muted" style="margin:6px 0 0">
            {{ genderText(t.gender) }}
            <template v-if="t.lifeStage"> · {{ t.lifeStage }}</template>
            <template v-if="t.hometown"> · {{ t.hometown }}</template>
            <template v-if="t.nickname && t.nickname !== t.name"> · 昵称 {{ t.nickname }}</template>
          </p>
        </div>
      </div>
      <div v-if="t.schedule" class="guide-traveler-trip"><OperationsIcon name="calendar" /><span>{{ t.schedule.startDate }} · {{ t.schedule.title }}</span></div>
    </div>

    <div class="card"><div class="pad">
      <div class="guide-section-heading"><div><h3>出行信息</h3><p>{{ t.phonesVisible === false ? '为保护出行人，完整联系方式在正式开团后开放。' : '联系出行人时，请仅用于本次行程服务。' }}</p></div><OperationsIcon name="shield" /></div>
      <div class="trip-kv">
        <span class="muted">手机</span>
        <a v-if="t.phonesVisible !== false && telHref(t.phone)" class="tel-link" :href="telHref(t.phone)">{{ t.phone }}</a>
        <strong v-else>{{ t.phone || "未填" }}</strong>
      </div>
      <div class="trip-kv">
        <span class="muted">紧急联系人</span>
        <span class="kv-right">
          {{ t.emergencyName || "未填" }}
          <a v-if="t.phonesVisible !== false && telHref(t.emergencyPhone)" class="tel-link" :href="telHref(t.emergencyPhone)">{{ t.emergencyPhone }}</a>
          <template v-else>{{ t.emergencyPhone || "" }}</template>
        </span>
      </div>
      <div class="trip-kv">
        <span class="muted">身份证</span>
        <strong>{{ t.idCard || "未填" }}</strong>
      </div>
      <div class="trip-kv">
        <span class="muted">座位</span>
        <strong>{{ t.seatNo || "未排" }}</strong>
      </div>
      <div class="trip-kv">
        <span class="muted">支付</span>
        <strong>{{ payStatusText(t.payStatus) }}</strong>
      </div>
      <div class="trip-kv">
        <span class="muted">保险</span>
        <strong>{{ insuranceText(t.insurance) }}</strong>
      </div>
      <div class="trip-kv">
        <span class="muted">签到</span>
        <strong>{{ t.openSession ? (t.sessionChecked ? "本轮已到" : "本轮未到") : (t.checkinAt ? "已签到" : "未签到") }}</strong>
      </div>
      <p v-if="msg" class="guide-message" role="status">{{ msg }}</p>
      <button v-if="t.openSession && !t.sessionChecked" class="btn block" style="margin-top:18px" type="button" :disabled="busy" @click="checkin">{{ busy ? '正在登记…' : `为 ${t.name} 登记本轮签到` }}</button>
      <button v-else-if="t.openSession && t.sessionChecked" class="btn ghost block" style="margin-top:18px" type="button" :disabled="busy" @click="uncheckin">{{ busy ? '正在处理…' : '撤销本轮签到' }}</button>
      <button v-else-if="!t.checkinAt" class="btn block" style="margin-top:18px" type="button" :disabled="busy" @click="checkin">{{ busy ? '正在登记…' : `为 ${t.name} 登记签到` }}</button>
    </div></div>

    <template v-if="t.profile">
      <div class="h2">个人相册</div>
      <div class="album-grid" v-if="t.profile.album?.length">
        <img v-for="p in t.profile.album" :key="p.id" :src="p.url" alt="" />
      </div>
      <p class="muted" v-else>还没有相册。</p>

      <div class="h2">即将参与的行程</div>
      <div class="card" v-for="item in t.profile.trips?.upcoming || []" :key="'u' + item.id">
        <div class="pad">
          <div class="row"><strong>{{ item.title }}</strong><span class="tag">{{ item.startDate }}</span></div>
          <p class="muted" style="margin:6px 0 0">{{ item.region }}</p>
        </div>
      </div>
      <p class="muted" v-if="!t.profile.trips?.upcoming?.length">暂无即将出发的行程。</p>

      <div class="h2">已参与</div>
      <div class="card" v-for="item in t.profile.trips?.past || []" :key="'p' + item.id">
        <div class="pad">
          <div class="row"><strong>{{ item.title }}</strong><span class="tag">{{ item.startDate }}</span></div>
        </div>
      </div>
      <p class="muted" v-if="!t.profile.trips?.past?.length">还没有过往行程。</p>
    </template>
  </div>
  <div v-else-if="err" class="guide-message" role="alert">{{ err }} <button class="guide-text-action" type="button" @click="load">重新加载</button></div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import http from "@/api/http";
import LoadRow from "@/components/LoadRow.vue";
import { genderText, insuranceText, payStatusText } from "@/utils/labels";
import { telHref } from "@/utils/phone";
import OperationsIcon from "@/components/OperationsIcon.vue";

const route = useRoute();
const t = ref(null);
const err = ref("");
const msg = ref("");
const busy = ref(false);

async function load() {
  err.value = "";
  try {
    t.value = (await http.get(`/guide/schedules/${route.params.id}/travelers/${route.params.enrollmentId}`)).data;
  } catch (e) {
    err.value = e.message || "未找到该游客";
  }
}

onMounted(load);

async function checkin() {
  if (busy.value) return;
  busy.value = true;
  try {
    await http.post(`/guide/schedules/${route.params.id}/checkin`, { enrollmentId: Number(route.params.enrollmentId) });
    msg.value = "已签到";
    await load();
  } catch (e) {
    msg.value = e.message;
  } finally { busy.value = false; }
}

async function uncheckin() {
  if (busy.value || !window.confirm(`确认撤销 ${t.value?.name || '该出行人'} 的本轮签到吗？`)) return;
  busy.value = true;
  try {
    await http.post(`/guide/schedules/${route.params.id}/checkin`, {
      enrollmentId: Number(route.params.enrollmentId),
      marked: false,
    });
    msg.value = "已撤销";
    await load();
  } catch (e) {
    msg.value = e.message;
  } finally { busy.value = false; }
}
</script>

<style scoped>
.tel-link {
  color: var(--leaf);
  text-decoration: underline;
  text-underline-offset: 2px;
  font-weight: 600;
  -webkit-tap-highlight-color: rgba(64, 145, 108, 0.25);
}
.trip-kv {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--line);
}
.trip-kv:last-of-type { border-bottom: 0; }
.trip-kv strong, .kv-right { text-align: right; word-break: break-all; }
.kv-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.guide-traveler-intro { background: #ece4f3 !important; border-color: #e8dff0 !important; }
.guide-traveler-intro .guide-face { background: #fff; color: #9473a7; border: 0; }
.guide-traveler-intro .ops-eyebrow { margin-bottom: 7px; font-size: 7px; }
.guide-traveler-intro strong { color: #715181; font-weight: 550; }
.guide-traveler-trip { padding: 13px 20px; border-top: 1px solid #ded3e8; color: #a187b1; display: flex; align-items: center; gap: 7px; font-size: 10px; }
.guide-traveler-trip .ops-icon { width: 13px; height: 13px; }
.guide-text-action { border: 0; background: none; color: inherit; font-size: 11px; text-decoration: underline; cursor: pointer; }
</style>
