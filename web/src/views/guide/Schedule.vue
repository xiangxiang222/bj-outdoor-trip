<template>
  <div v-if="loadError && !s" class="guide-message" role="alert">{{ loadError }} <button class="guide-text-action" type="button" @click="load">重新加载</button></div>
  <LoadRow v-else-if="!s" />
  <div v-else class="guide-schedule">
    <div class="guide-detail-hero">
      <span class="ops-eyebrow">{{ s.completedAt ? 'TRIP COMPLETED' : s.startedAt ? 'TRIP IN PROGRESS' : 'PREPARE FOR DEPARTURE' }}</span>
      <h2>{{ s.route.title }}</h2>
      <div class="guide-detail-facts"><span><OperationsIcon name="calendar" />{{ s.startDate }} · {{ s.route.days || 1 }} 日行程</span><span><OperationsIcon name="pin" />{{ s.meetupPoint }} · {{ s.meetupTime }}</span><span><OperationsIcon name="bus" />{{ s.bus?.name || '车型待确认' }}</span></div>
      <div class="guide-detail-status"><span>当前服务状态</span><strong>{{ s.status === 'cancelled' ? '本次行程已取消' : s.completedAt ? '旅程已完成' : s.startedAt ? '一路平安，带团中' : '出发准备中' }}</strong></div>
    </div>

    <p v-if="loadError" class="guide-message" role="alert">{{ loadError }}</p>

    <div class="guide-quicknav" aria-label="快速查看">
      <button type="button" @click="scrollTo('attendance')"><OperationsIcon name="check" />集合签到</button>
      <button type="button" @click="scrollTo('transport')"><OperationsIcon name="bus" />车辆与联系</button>
      <button type="button" @click="scrollTo('roster')"><OperationsIcon name="people" />出行名单</button>
    </div>

    <div id="attendance" class="card">
      <div class="pad">
        <div class="guide-section-heading"><div><h3>集合与签到</h3><p>清点到场的伙伴，每轮确认后可继续发起下一站签到。</p></div><span class="guide-trip-status" :class="{ active: !!openSession }">{{ openSession ? '签到进行中' : s.completedAt ? '行程已结束' : '准备就绪' }}</span></div>
        <div class="guide-attendance-counts"><div><strong>{{ rosterCount }}</strong><span>应到人数</span></div><div><strong>{{ checked }}</strong><span>{{ openSession ? '本轮已到' : '已签到' }}</span></div><div><strong>{{ rosterCount - checked }}</strong><span>尚未签到</span></div></div>
        <div class="guide-attendance-progress"><i :style="{ width: `${attendancePercent}%` }"></i></div>
        <div v-if="openSession" class="guide-round-active"><div><span class="ops-eyebrow">CURRENT CHECK-IN</span><strong>{{ openSession.title }}</strong><small>{{ checked }} 位已签到 · {{ rosterCount }} 位应到</small></div><button class="btn" type="button" :disabled="confirming || tripInactive" @click="confirmRound">{{ confirming ? '确认中…' : '核对并结束本轮签到' }}</button></div>
        <template v-else-if="!tripInactive">
          <label for="guide-stop">开始一轮新的签到</label><div class="guide-start-checkin"><select id="guide-stop" class="input" v-model="stopKey"><option v-for="st in stops" :key="st.key" :value="st.key">{{ st.time ? st.time + ' ' : '' }}{{ st.title }}</option></select><button class="btn" type="button" :disabled="opening || !stops.length" @click="openRound">{{ opening ? '正在发起…' : '发起签到' }}</button></div>
        </template>
        <div class="guide-checkin-history" v-if="pastSessions.length"><h4>已完成签到</h4><div v-for="sess in pastSessions" :key="sess.id"><OperationsIcon name="check" /><span>{{ sess.title }}</span><small>{{ sess.markedCount }} / {{ sess.total }} 人 · {{ sess.confirmedAt }}</small></div></div>
      </div>
    </div>

    <div class="guide-section-heading guide-subsection-heading"><div><h3>出行天气</h3><p>关注目的地天气，遇到预警请及时安排调整。</p></div></div>
    <div v-if="weather" class="weather" :class="weather.alerts?.[0]?.level"><strong>{{ weather.summary }} {{ weather.tmin }}~{{ weather.tmax }}℃ · 风 {{ weather.wind }}km/h</strong><WeatherChart :hourly="weather.hourly" :label="'分时气温'" /><p>{{ weather.alerts?.[0]?.text || '出发前请再次确认目的地最新天气。' }}</p></div>
    <div v-else class="card"><div class="pad"><p class="muted">天气信息暂时无法获取，请出发前查看目的地最新预报。</p></div></div>

    <div id="transport" class="card">
      <div class="pad">
        <div class="guide-section-heading"><div><h3>车辆与本团联系</h3><p>补全接驳信息，方便伙伴顺利与团队会合。</p></div><OperationsIcon name="bus" /></div>
        <template v-if="!tripEditing">
          <div class="trip-kv"><span class="muted">用车安排</span><strong>{{ s.bus?.name || '车型待确认' }}<template v-if="s.bus?.seats"> · {{ s.bus.seats }} 座</template></strong></div>
          <div class="trip-kv"><span class="muted">车牌号</span><strong>{{ plateNo || "尚未填写" }}</strong></div>
          <div class="trip-kv"><span class="muted">本团联系群</span><strong>{{ consultGroup || "尚未设置" }}</strong></div>
          <p v-if="tripMsg" class="guide-message">{{ tripMsg }}</p><button class="btn ghost block" type="button" @click="startEditTrip">编辑行程联系信息</button>
        </template>
        <template v-else>
          <label for="plate">车牌号</label><input id="plate" class="input block" v-model="plateNo" maxlength="20" placeholder="出发前确认，例如 京A·D83001" />
          <label for="consult">本团联系群</label><input id="consult" class="input block" v-model="consultGroup" maxlength="60" placeholder="微信群名或入群口令" />
          <p v-if="tripMsg" class="guide-message">{{ tripMsg }}</p><div class="trip-actions"><button class="btn block" type="button" :disabled="tripSaving" @click="saveTrip">{{ tripSaving ? "保存中…" : "保存联系信息" }}</button><button v-if="tripCanCancel" class="btn ghost block" type="button" :disabled="tripSaving" @click="cancelEditTrip">取消修改</button></div>
        </template>
      </div>
    </div>

    <div class="card">
      <div class="pad">
        <div class="guide-section-heading"><div><h3>座位安排</h3><p>选择一位伙伴，再选择目标座位完成调整；点击空位可锁定或解锁。</p></div></div>
        <div class="guide-seat-legend"><span><i></i> 空位</span><span><i class="taken"></i> 已安排</span><span><i class="locked"></i> 锁定</span></div>
        <div class="seat-map"><div class="seat-front">车头</div><div class="seat-row" v-for="row in seatRows" :key="row[0].row"><template v-for="seat in row" :key="seat.no"><button type="button" class="seat" :disabled="tripInactive || seatBusy" :class="{ taken: seat.taken && !seat.locked, locked: seat.locked, on: !!pickFrom && pickFrom === seat.enrollmentId }" :aria-label="seat.occupant?.name ? `${seat.no} ${seat.occupant.name}` : `${seat.no} ${seat.locked ? '已锁定' : '空位'}`" @click="onManageSeat(seat)">{{ seat.locked ? "锁" : (seat.occupant?.initial || seat.col) }}</button><i v-if="seat.aisleAfter" class="seat-aisle" /></template></div></div>
        <p v-if="pickFrom" class="guide-seat-selection" role="status">已选择一位伙伴，请点击新的座位完成安排。<button class="guide-text-action" type="button" @click="pickFrom = null">取消</button></p>
      </div>
    </div>

    <div id="roster" class="guide-section-heading guide-subsection-heading"><div><h3>出行名单</h3><p>仅展示有效报名 · 出发前不展示完整联系方式。</p></div><OperationsIcon name="people" /></div>
    <div class="guide-roster-controls"><div class="guide-search"><OperationsIcon name="search" /><input v-model.trim="query" type="search" aria-label="搜索出行人" placeholder="搜索姓名、座位、手机号尾号" /></div><select v-model="rosterFilter" class="input" aria-label="筛选签到状态"><option value="all">全部 · {{ rosterCount }}</option><option value="checked">已签到 · {{ checked }}</option><option value="unchecked">未签到 · {{ rosterCount - checked }}</option></select></div>
    <div class="card guide-roster">
        <div class="pad chain-item" v-for="r in filteredRoster" :key="r.id">
        <span class="guide-seat-number">{{ r.seatNo || "—" }}</span>
        <span>
          <button type="button" class="traveler-name" @click="openTraveler(r)">{{ r.name }}</button>
          <div class="guide-contact-line" v-if="r.phonesVisible !== false && telHref(r.phone)"><a class="tel-link" :href="telHref(r.phone)" @click.stop>{{ r.phone }}</a></div><div class="guide-contact-line" v-else>联系方式将在出发后开放</div>
          <div class="guide-contact-line" v-if="r.emergencyName">紧急联系人 {{ r.emergencyName }}<template v-if="r.phonesVisible !== false && telHref(r.emergencyPhone)"> · <a class="tel-link" :href="telHref(r.emergencyPhone)" @click.stop>{{ r.emergencyPhone }}</a></template></div>
        </span>
        <button v-if="!isCheckedIn(r)" class="btn" type="button" :aria-label="`${r.name}签到`" :disabled="busyIds.has(r.id) || tripInactive" @click="checkin(r)">{{ busyIds.has(r.id) ? '…' : '签到' }}</button>
        <button v-else class="btn ghost" type="button" :aria-label="`${r.name}已签到，撤销签到`" :disabled="busyIds.has(r.id) || !openSession || tripInactive" @click="uncheckin(r)"><OperationsIcon name="check" />已到</button>
      </div>
      <div v-if="!filteredRoster.length" class="guide-empty guide-roster-empty"><OperationsIcon :name="query ? 'search' : 'people'" /><p>{{ query || rosterFilter !== 'all' ? '没有符合条件的出行人' : '目前还没有有效报名' }}</p><small>{{ query || rosterFilter !== 'all' ? '调整筛选条件，或试试其他姓名和手机尾号。' : '新的有效报名会自动出现在这里。' }}</small></div>
    </div>
    <p v-if="msg" class="guide-message" role="status" aria-live="polite">{{ msg }}</p>

    <div v-if="!s.startedAt && !tripInactive" class="guide-trip-command"><div><span class="ops-eyebrow">DEPARTURE</span><strong>{{ s.canStartTrip ? '准备好出发了吗？' : '请在出发当天正式开团' }}</strong><small>{{ s.canStartTrip ? '开始行程后，报名伙伴的联系方式将开放。' : '开团日期为 ' + s.startDate + '（北京时间），出发前联系方式保持隐藏。' }}</small></div><button class="btn" type="button" :disabled="starting || !s.canStartTrip" @click="startOfficial">{{ starting ? "正在确认…" : "正式开团" }}</button></div>
    <div v-else-if="s.completedAt" class="guide-finish-note"><OperationsIcon name="check" /><span>行程已完成 · {{ s.completedAt }}<small>大家可以参与行程评价和评选。</small></span></div>
    <div v-else-if="s.canCloseTrip" class="guide-trip-command is-finish"><div><span class="ops-eyebrow">JOURNEY COMPLETE</span><strong>本次行程结束了吗？</strong><small>确认后，出行伙伴可以评价和参与评选。</small></div><button class="btn ghost" type="button" :disabled="closing" @click="closeTrip">{{ closing ? "正在结束…" : "结束行程" }}</button></div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import LoadRow from "@/components/LoadRow.vue";
import WeatherChart from "@/components/WeatherChart.vue";
import OperationsIcon from "@/components/OperationsIcon.vue";
import { telHref } from "@/utils/phone";
import { filterGuideRoster, guideCheckedIn } from "@/utils/guideWorkspace";

const route = useRoute();
const router = useRouter();
const s = ref(null);
const weather = ref(null);
const msg = ref("");
const loadError = ref("");
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
const checked = computed(() => (s.value?.roster || []).filter((r) => guideCheckedIn(r, !!openSession.value)).length);
const stopKey = ref("depart");
const starting = ref(false);
const closing = ref(false);
const opening = ref(false);
const confirming = ref(false);
const query = ref("");
const rosterFilter = ref("all");
const busyIds = ref(new Set());
const seatBusy = ref(false);
const tripInactive = computed(() => !!s.value?.completedAt || s.value?.status === "cancelled");
const rosterCount = computed(() => s.value?.roster?.length || 0);
const attendancePercent = computed(() => rosterCount.value ? Math.round(checked.value * 100 / rosterCount.value) : 0);
const filteredRoster = computed(() => filterGuideRoster(s.value?.roster, { query: query.value, state: rosterFilter.value, hasOpenSession: !!openSession.value }));
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

function isCheckedIn(person) {
  return guideCheckedIn(person, !!openSession.value);
}

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function load() {
  loadError.value = "";
  try {
    s.value = (await http.get("/guide/schedules/" + route.params.id)).data;
  } catch (e) { loadError.value = e.message || "行程信息加载失败，请重试。"; return; }
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
  if (tripInactive.value || seatBusy.value) return;
  seatBusy.value = true;
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
      pickFrom.value = pickFrom.value === seat.enrollmentId ? null : seat.enrollmentId;
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
  } finally { seatBusy.value = false; }
}

async function closeTrip() {
  if (!window.confirm("确认结束这次行程吗？结束后，全团出行人将可以评价本次行程。")) return;
  closing.value = true;
  msg.value = "";
  try {
    const data = (await http.post(`/guide/schedules/${route.params.id}/complete`)).data;
    s.value = { ...s.value, ...data };
    msg.value = data.already ? "行程已经结束" : "已结束行程，全团可以评价和评选";
  } catch (e) {
    msg.value = e.message;
  } finally {
    closing.value = false;
  }
}

async function startOfficial() {
  if (!window.confirm("确认已核对集合信息，并正式开始本次行程吗？")) return;
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
  const outstanding = rosterCount.value - checked.value;
  if (!window.confirm(outstanding > 0 ? `本轮 ${checked.value} / ${rosterCount.value} 人已签到，仍有 ${outstanding} 位未签到。确认结束「${session.title}」吗？` : `全员已到，确认结束「${session.title}」吗？`)) return;
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
  if (busyIds.value.has(row.id)) return;
  busyIds.value = new Set(busyIds.value).add(row.id);
  try {
    await http.post(`/guide/schedules/${route.params.id}/checkin`, { enrollmentId: row.id });
    msg.value = `${row.name} 已到`;
    await load();
  } catch (e) {
    msg.value = e.message;
  } finally { const next = new Set(busyIds.value); next.delete(row.id); busyIds.value = next; }
}

async function uncheckin(row) {
  if (busyIds.value.has(row.id)) return;
  if (!window.confirm(`撤销 ${row.name} 本轮签到吗？`)) return;
  busyIds.value = new Set(busyIds.value).add(row.id);
  try {
    await http.post(`/guide/schedules/${route.params.id}/checkin`, { enrollmentId: row.id, marked: false });
    msg.value = `${row.name} 已撤销`;
    await load();
  } catch (e) {
    msg.value = e.message;
  } finally { const next = new Set(busyIds.value); next.delete(row.id); busyIds.value = next; }
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
  font-size: calc(13px * var(--ui-scale));
  margin: 10px 0;
}
.trip-actions { display: flex; flex-direction: column; gap: 8px; }
.guide-seat-selection { display: flex; align-items: center; justify-content: center; gap: 8px; background: #f1eaf6; color: #8e709f; border-radius: 8px; padding: 11px; font-size: 11px; }
.guide-text-action { padding: 3px 6px; border: 0; background: transparent; color: #6d4d80; text-decoration: underline; cursor: pointer; }
</style>
