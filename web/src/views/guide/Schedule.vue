<template>
  <div v-if="s">
    <div class="card">
      <div class="pad">
        <strong>{{ s.route.title }}</strong>
        <p>{{ s.startDate }} · {{ s.bus?.name }}<template v-if="s.bus?.seats"> · {{ s.bus.seats }}座</template><template v-if="s.bus?.plateNo"> · {{ s.bus.plateNo }}</template></p>
        <p>集合 {{ s.meetupPoint }} {{ s.meetupTime }}</p>
        <p>已报 {{ s.enrolled }} / {{ s.maxSeats }} · {{ checkinLine }}</p>
        <p v-if="s.startedAt" class="muted" style="color:var(--leaf)">已正式开团 {{ s.startedAt }}</p>
        <div v-if="weather" class="weather" :class="weather.alerts?.[0]?.level">
          <strong>{{ weather.summary }} {{ weather.tmin }}~{{ weather.tmax }}℃ · 风 {{ weather.wind }}km/h</strong>
          <WeatherChart :hourly="weather.hourly" :label="'分时气温'" />
          <p>{{ weather.alerts?.[0]?.text }}</p>
        </div>
      </div>
    </div>

    <div class="h2">正式开团与签到</div>
    <div class="card"><div class="pad">
      <p class="muted" style="margin:0 0 10px">出发前上车、每个休息点都可以再开一轮。核对名单后点确认，下一轮才能发起。没上车的交费客行程结束后仍可抽奖。</p>
      <button v-if="!s.startedAt" class="btn block" type="button" :disabled="starting" @click="startOfficial">{{ starting ? "开团中…" : "正式开团" }}</button>
      <template v-if="openSession">
        <p><strong>本轮 {{ openSession.title }}</strong> · 已到 {{ openSession.markedCount }} / {{ openSession.total }}</p>
        <button class="btn block" type="button" :disabled="confirming" @click="confirmRound">{{ confirming ? "确认中…" : "确认本轮签到" }}</button>
      </template>
      <template v-else>
        <label>签到点</label>
        <select class="input" v-model="stopKey">
          <option v-for="st in stops" :key="st.key" :value="st.key">{{ st.time ? st.time + " " : "" }}{{ st.title }}</option>
        </select>
        <button class="btn block" type="button" style="margin-top:10px" :disabled="opening" @click="openRound">{{ opening ? "发起中…" : "发起签到" }}</button>
      </template>
      <div v-if="pastSessions.length" class="muted" style="margin-top:12px">
        <div v-for="sess in pastSessions" :key="sess.id">{{ sess.title }} · 已确认 {{ sess.markedCount }}/{{ sess.total }}</div>
      </div>
    </div></div>

    <div class="h2">车辆与本团群</div>
    <div class="card"><div class="pad">
      <template v-if="!tripEditing">
        <div class="trip-kv">
          <span class="muted">车牌号</span>
          <strong>{{ plateNo || "未填" }}</strong>
        </div>
        <div class="trip-kv">
          <span class="muted">本团咨询群</span>
          <strong>{{ consultGroup || "未填" }}</strong>
        </div>
        <p v-if="tripMsg" class="trip-ok">{{ tripMsg }}</p>
        <button class="btn ghost block" type="button" @click="startEditTrip">修改</button>
      </template>
      <template v-else>
        <label>车牌号</label>
        <input class="input" v-model="plateNo" placeholder="确认后填写，如 京A·D83001" />
        <label>本团咨询群</label>
        <input class="input" v-model="consultGroup" placeholder="群名或入群口令" />
        <p v-if="tripMsg" class="muted">{{ tripMsg }}</p>
        <div class="trip-actions">
          <button class="btn block" type="button" :disabled="tripSaving" @click="saveTrip">{{ tripSaving ? "保存中…" : "保存" }}</button>
          <button v-if="tripCanCancel" class="btn ghost block" type="button" :disabled="tripSaving" @click="cancelEditTrip">取消</button>
        </div>
      </template>
    </div></div>

    <div class="h2">座位（点空位锁定，点占用位再点目标位对调）</div>
    <div class="card"><div class="pad">
      <div class="seat-map">
        <div class="seat-front">车头</div>
        <div class="seat-row" v-for="row in seatRows" :key="row[0].row">
          <template v-for="seat in row" :key="seat.no">
            <button
              type="button"
              class="seat"
              :class="{ taken: seat.taken && !seat.locked, locked: seat.locked, on: pickFrom === seat.enrollmentId }"
              @click="onManageSeat(seat)"
            >{{ seat.locked ? "锁" : (seat.occupant?.initial || seat.col) }}</button>
            <i v-if="seat.aisleAfter" class="seat-aisle" />
          </template>
        </div>
      </div>
    </div></div>

    <div class="h2">出行名单</div>
    <p class="muted" style="margin:0 0 8px">点姓名看详情。正式开团前手机号打码，开团后才能拨打。</p>
    <div class="card">
      <div class="pad chain-item" v-for="r in s.roster" :key="r.id">
        <span>{{ r.seatNo || "-" }}</span>
        <span>
          <button type="button" class="traveler-name" @click="openTraveler(r)">{{ r.name }}</button>
          ·
          <a v-if="r.phonesVisible !== false && telHref(r.phone)" class="tel-link" :href="telHref(r.phone)" @click.stop>{{ r.phone }}</a>
          <template v-else>{{ r.phone }}</template>
          <div class="muted">
            紧急 {{ r.emergencyName || "未填" }}
            <a v-if="r.phonesVisible !== false && telHref(r.emergencyPhone)" class="tel-link" :href="telHref(r.emergencyPhone)" @click.stop>{{ r.emergencyPhone }}</a>
            <template v-else>{{ r.emergencyPhone || "" }}</template>
          </div>
        </span>
        <button v-if="openSession && !r.sessionChecked" class="btn" style="padding:4px 10px" type="button" @click="checkin(r)">签到</button>
        <button v-else-if="openSession && r.sessionChecked" class="btn ghost" style="padding:4px 10px" type="button" @click="uncheckin(r)">已到</button>
        <span v-else-if="r.checkinAt" class="muted">已签</span>
        <button v-else class="btn" style="padding:4px 10px" type="button" @click="checkin(r)">签到</button>
      </div>
      <p v-if="!s.roster?.length" class="muted pad">还没有有效报名。</p>
    </div>
    <p v-if="msg" class="muted">{{ msg }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import WeatherChart from "@/components/WeatherChart.vue";
import { telHref } from "@/utils/phone";

const route = useRoute();
const router = useRouter();
const s = ref(null);
const weather = ref(null);
const msg = ref("");
const plateNo = ref("");
const consultGroup = ref("");
const seatChart = ref(null);
const pickFrom = ref(null);
const tripEditing = ref(false);
const tripSaving = ref(false);
const tripMsg = ref("");
const tripLoaded = ref(false);
const tripCanCancel = computed(() => !!(s.value?.bus?.plateNo || s.value?.consultGroup));
const openSession = computed(() => s.value?.checkin?.openSession || null);
const stops = computed(() => s.value?.checkin?.stops || []);
const pastSessions = computed(() => (s.value?.checkin?.sessions || []).filter((row) => row.status === "confirmed"));
const checked = computed(() => {
  if (openSession.value) return Number(openSession.value.markedCount || 0);
  return (s.value?.roster || []).filter((r) => r.checkinAt).length;
});
const checkinLine = computed(() => {
  if (openSession.value) return `本轮已到 ${checked.value}`;
  return `已签到 ${checked.value}`;
});
const stopKey = ref("depart");
const starting = ref(false);
const opening = ref(false);
const confirming = ref(false);
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

onMounted(load);

function applyTripFields(data) {
  plateNo.value = data?.bus?.plateNo || "";
  consultGroup.value = data?.consultGroup || "";
}

async function load() {
  s.value = (await http.get("/guide/schedules/" + route.params.id)).data;
  if (!openSession.value) {
    const first = (s.value?.checkin?.stops || [])[0];
    if (first && !stops.value.some((st) => st.key === stopKey.value)) stopKey.value = first.key;
    else if (!stopKey.value) stopKey.value = first?.key || "depart";
  }
  if (!tripEditing.value || !tripLoaded.value) applyTripFields(s.value);
  if (!tripLoaded.value) {
    tripEditing.value = !(plateNo.value || consultGroup.value);
    tripLoaded.value = true;
  }
  try {
    seatChart.value = (await http.get("/schedules/" + route.params.id + "/seats")).data;
  } catch {
    seatChart.value = null;
  }
  try {
    weather.value = (await http.get("/weather", { params: { region: s.value.route.region, date: s.value.startDate } })).data;
  } catch {
    weather.value = null;
  }
}

function startEditTrip() {
  tripMsg.value = "";
  tripEditing.value = true;
}

function cancelEditTrip() {
  applyTripFields(s.value);
  tripEditing.value = false;
  tripMsg.value = "";
}

async function saveTrip() {
  tripSaving.value = true;
  tripMsg.value = "";
  try {
    const data = (await http.put(`/guide/schedules/${route.params.id}/trip`, {
      plateNo: plateNo.value,
      consultGroup: consultGroup.value,
    })).data;
    s.value = { ...s.value, ...data, roster: s.value.roster };
    applyTripFields(s.value);
    tripEditing.value = false;
    tripMsg.value = "已保存";
  } catch (e) {
    tripMsg.value = e.message;
  } finally {
    tripSaving.value = false;
  }
}

function openTraveler(row) {
  router.push(`/g/schedule/${route.params.id}/traveler/${row.id}`);
}

async function onManageSeat(seat) {
  try {
    if (seat.occupant?.enrollmentId) {
      if (pickFrom.value && pickFrom.value !== seat.enrollmentId) {
        await http.post(`/guide/schedules/${route.params.id}/seats/assign`, {
          enrollmentId: pickFrom.value,
          seatNo: seat.no,
        });
        pickFrom.value = null;
        msg.value = "已对调座位";
        await load();
        return;
      }
      pickFrom.value = seat.enrollmentId;
      msg.value = "已选 " + seat.no + "，再点目标座位完成调换";
      return;
    }
    if (pickFrom.value) {
      await http.post(`/guide/schedules/${route.params.id}/seats/assign`, {
        enrollmentId: pickFrom.value,
        seatNo: seat.no,
      });
      pickFrom.value = null;
      msg.value = "已调到 " + seat.no;
      await load();
      return;
    }
    await http.post(`/guide/schedules/${route.params.id}/seats/lock`, { seatNo: seat.no, locked: !seat.locked });
    msg.value = seat.locked ? "已解锁 " + seat.no : "已锁定 " + seat.no;
    await load();
  } catch (e) {
    msg.value = e.message;
  }
}

async function startOfficial() {
  starting.value = true;
  msg.value = "";
  try {
    const data = (await http.post(`/guide/schedules/${route.params.id}/start`)).data;
    s.value = { ...s.value, ...data };
    msg.value = data.already ? "已经正式开团" : "已正式开团";
  } catch (e) {
    msg.value = e.message;
  } finally {
    starting.value = false;
  }
}

async function openRound() {
  opening.value = true;
  msg.value = "";
  try {
    s.value = (await http.post(`/guide/schedules/${route.params.id}/checkins`, { stopKey: stopKey.value })).data;
    msg.value = `已发起「${s.value.checkin?.openSession?.title || "签到"}」`;
  } catch (e) {
    msg.value = e.message;
  } finally {
    opening.value = false;
  }
}

async function confirmRound() {
  const session = openSession.value;
  if (!session) return;
  confirming.value = true;
  msg.value = "";
  try {
    s.value = (await http.post(`/guide/schedules/${route.params.id}/checkins/${session.id}/confirm`)).data;
    msg.value = `已确认「${session.title}」`;
  } catch (e) {
    msg.value = e.message;
  } finally {
    confirming.value = false;
  }
}

async function checkin(row) {
  try {
    await http.post(`/guide/schedules/${route.params.id}/checkin`, { enrollmentId: row.id });
    msg.value = `${row.name} 已到`;
    await load();
  } catch (e) {
    msg.value = e.message;
  }
}

async function uncheckin(row) {
  try {
    await http.post(`/guide/schedules/${route.params.id}/checkin`, { enrollmentId: row.id, marked: false });
    msg.value = `${row.name} 已撤销`;
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
  padding: 4px 0;
  -webkit-tap-highlight-color: rgba(64, 145, 108, 0.25);
}
.muted .tel-link { color: var(--leaf); }
.traveler-name {
  display: inline;
  padding: 0;
  margin: 0;
  border: 0;
  background: none;
  color: var(--leaf);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
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
.trip-kv strong { text-align: right; word-break: break-all; }
.trip-ok {
  color: var(--leaf);
  font-size: 13px;
  margin: 10px 0;
}
.trip-actions { display: flex; flex-direction: column; gap: 8px; }
</style>
