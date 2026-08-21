<template>
  <div v-if="s">
    <div class="card">
      <div class="pad">
        <strong>{{ s.route.title }}</strong>
        <p>{{ s.startDate }} · {{ s.bus?.name }}<template v-if="s.bus?.seats"> · {{ s.bus.seats }}座</template><template v-if="s.bus?.plateNo"> · {{ s.bus.plateNo }}</template></p>
        <p>集合 {{ s.meetupPoint }} {{ s.meetupTime }}</p>
        <p>已报 {{ s.enrolled }} / {{ s.maxSeats }} · 已签到 {{ checked }}</p>
        <div v-if="weather" class="weather" :class="weather.alerts?.[0]?.level">
          <strong>{{ weather.summary }} {{ weather.tmin }}~{{ weather.tmax }}℃</strong>
          <p>{{ weather.alerts?.[0]?.text }}</p>
        </div>
      </div>
    </div>

    <div class="h2">车辆与本团群</div>
    <div class="card"><div class="pad">
      <label>车牌号</label>
      <input class="input" v-model="plateNo" placeholder="确认后填写，如 京A·D83001" />
      <label>本团咨询群</label>
      <input class="input" v-model="consultGroup" placeholder="群名或入群口令" />
      <button class="btn block" @click="saveTrip">保存车辆信息</button>
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
    <div class="card">
      <div class="pad chain-item" v-for="r in s.roster" :key="r.id">
        <span>{{ r.seatNo || "-" }}</span>
        <span>{{ r.name }} · {{ r.phone }}<div class="muted">紧急 {{ r.emergencyName || "未填" }} {{ r.emergencyPhone || "" }}</div></span>
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
import { useRoute } from "vue-router";
import http from "@/api/http";

const route = useRoute();
const s = ref(null);
const weather = ref(null);
const msg = ref("");
const plateNo = ref("");
const consultGroup = ref("");
const seatChart = ref(null);
const pickFrom = ref(null);
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

async function load() {
  s.value = (await http.get("/guide/schedules/" + route.params.id)).data;
  plateNo.value = s.value.bus?.plateNo || "";
  consultGroup.value = s.value.consultGroup || "";
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

async function saveTrip() {
  try {
    s.value = (await http.put(`/guide/schedules/${route.params.id}/trip`, { plateNo: plateNo.value, consultGroup: consultGroup.value })).data;
    msg.value = "车辆与咨询群已保存";
  } catch (e) {
    msg.value = e.message;
  }
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
