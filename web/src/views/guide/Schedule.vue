<template>
  <div v-if="s">
    <div class="card">
      <div class="pad">
        <strong>{{ s.route.title }}</strong>
        <p>{{ s.startDate }} · {{ s.bus?.name }}<template v-if="s.bus?.seats"> · {{ s.bus.seats }}座</template><template v-if="s.bus?.plateNo"> · {{ s.bus.plateNo }}</template></p>
        <p>集合 {{ s.meetupPoint }} {{ s.meetupTime }}</p>
        <p>已报 {{ s.enrolled }} / {{ s.maxSeats }} · 已签到 {{ checked }}</p>
        <div v-if="weather" class="weather" :class="weather.alerts?.[0]?.level">
          <strong>{{ weather.summary }} {{ weather.tmin }}~{{ weather.tmax }}℃ · 风 {{ weather.wind }}km/h</strong>
          <WeatherChart :hourly="weather.hourly" :label="'分时气温'" />
          <p>{{ weather.alerts?.[0]?.text }}</p>
        </div>
      </div>
    </div>

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
    <p class="muted" style="margin:0 0 8px">点姓名看详情，点号码可拨打</p>
    <div class="card">
      <div class="pad chain-item" v-for="r in s.roster" :key="r.id">
        <span>{{ r.seatNo || "-" }}</span>
        <span>
          <button type="button" class="traveler-name" @click="openTraveler(r)">{{ r.name }}</button>
          ·
          <a v-if="telHref(r.phone)" class="tel-link" :href="telHref(r.phone)" @click.stop>{{ r.phone }}</a>
          <template v-else>{{ r.phone }}</template>
          <div class="muted">
            紧急 {{ r.emergencyName || "未填" }}
            <a v-if="telHref(r.emergencyPhone)" class="tel-link" :href="telHref(r.emergencyPhone)" @click.stop>{{ r.emergencyPhone }}</a>
            <template v-else>{{ r.emergencyPhone || "" }}</template>
          </div>
        </span>
        <button v-if="!r.checkinAt" class="btn" style="padding:4px 10px" @click="checkin(r)">签到</button>
        <span v-else class="muted">已签</span>
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
const checked = computed(() => (s.value?.roster || []).filter((r) => r.checkinAt).length);
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

async function checkin(row) {
  try {
    await http.post(`/guide/schedules/${route.params.id}/checkin`, { enrollmentId: row.id });
    msg.value = `${row.name} 已签到`;
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
