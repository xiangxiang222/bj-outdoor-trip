<template>
  <div v-if="t">
    <div class="card">
      <div class="pad guide-row">
        <div class="guide-face" style="width:64px;height:64px;font-size:22px">
          <img v-if="t.avatar" :src="t.avatar" :alt="t.name" />
          <span v-else>{{ (t.name || "客").slice(0, 1) }}</span>
        </div>
        <div>
          <strong style="font-size:18px">{{ t.name }}</strong>
          <p class="muted" style="margin:6px 0 0">
            {{ genderText(t.gender) }}
            <template v-if="t.lifeStage"> · {{ t.lifeStage }}</template>
            <template v-if="t.hometown"> · {{ t.hometown }}</template>
            <template v-if="t.nickname && t.nickname !== t.name"> · 昵称 {{ t.nickname }}</template>
          </p>
        </div>
      </div>
    </div>

    <div class="card"><div class="pad">
      <div class="trip-kv">
        <span class="muted">手机</span>
        <a v-if="telHref(t.phone)" class="tel-link" :href="telHref(t.phone)">{{ t.phone }}</a>
        <strong v-else>{{ t.phone || "未填" }}</strong>
      </div>
      <div class="trip-kv">
        <span class="muted">紧急联系人</span>
        <span class="kv-right">
          {{ t.emergencyName || "未填" }}
          <a v-if="telHref(t.emergencyPhone)" class="tel-link" :href="telHref(t.emergencyPhone)">{{ t.emergencyPhone }}</a>
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
        <strong>{{ t.checkinAt ? "已签到" : "未签到" }}</strong>
      </div>
      <p v-if="msg" class="muted">{{ msg }}</p>
      <button v-if="!t.checkinAt" class="btn block" style="margin-top:12px" type="button" @click="checkin">签到</button>
    </div></div>

    <template v-if="t.profile">
      <div class="h2">个人相册</div>
      <div class="album-grid" v-if="t.profile.album?.length">
        <img v-for="p in t.profile.album" :key="p.id" :src="p.url" alt="" />
      </div>
      <p class="muted" v-else>还没有相册。</p>

      <div class="h2">拟出行</div>
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
  <p v-else-if="err" class="muted">{{ err }}</p>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import http from "@/api/http";
import { genderText, insuranceText, payStatusText } from "@/utils/labels";
import { telHref } from "@/utils/phone";

const route = useRoute();
const t = ref(null);
const err = ref("");
const msg = ref("");

async function load() {
  try {
    t.value = (await http.get(`/guide/schedules/${route.params.id}/travelers/${route.params.enrollmentId}`)).data;
  } catch (e) {
    err.value = e.message || "未找到该游客";
  }
}

onMounted(load);

async function checkin() {
  try {
    await http.post(`/guide/schedules/${route.params.id}/checkin`, { enrollmentId: Number(route.params.enrollmentId) });
    msg.value = "已签到";
    await load();
  } catch (e) {
    msg.value = e.message;
  }
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
</style>
