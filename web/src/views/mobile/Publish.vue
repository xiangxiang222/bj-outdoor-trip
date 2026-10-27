<template>
  <div class="publish-page">
    <header class="publish-intro">
      <span class="publish-eyebrow">{{ isActivity ? 'CITY MOMENTS' : 'GO TOGETHER' }}</span>
      <h1>{{ isActivity ? '把好时光，约在一起' : '把山野，变成我们的下一站' }}</h1>
      <p>{{ isActivity ? '发起一个同城小聚，遇见兴趣相投的人。' : '一条好线路，一群同路人。出发，由你发起。' }}</p>
    </header>

    <section v-if="postedId" class="publish-success"><span>✓</span><h2>{{ isActivity ? '活动已提交审核' : '排期发布成功' }}</h2><p>{{ isActivity ? '审核通过后就会出现在活动页。' : '已为你创建本次出发安排。' }}</p><router-link class="btn" :to="`/m/schedule/${postedId}`">查看行程详情</router-link></section>
    <nav v-if="!postedId" class="publish-steps" aria-label="发布进度">
      <button v-for="(name, index) in stepNames" :key="name" type="button" :class="{ active: step === index, done: step > index }" :disabled="index > step" @click="goStep(index)">
        <span>{{ step > index ? '✓' : String(index + 1).padStart(2, '0') }}</span><small>{{ name }}</small>
      </button>
    </nav>

    <form v-if="!postedId" @submit.prevent="advance" novalidate>
      <section v-show="step === 0" class="publish-card">
        <div class="publish-card-title"><span>01</span><div><h2>{{ isActivity ? '想约什么局' : '先选一段好风景' }}</h2><p>{{ isActivity ? '从共同的兴趣开始' : '精选成熟线路，行程与费用更清楚' }}</p></div></div>
        <template v-if="isActivity">
          <div class="publish-kinds" role="group" aria-label="活动玩法">
            <button v-for="kind in kinds" :key="kind.key" type="button" :class="{ selected: form.activityKind === kind.key }" @click="pickKind(kind.key)"><span>{{ kind.emoji }}</span><strong>{{ kind.label }}</strong></button>
          </div>
          <label for="publish-title">活动名称</label>
          <input id="publish-title" class="input" v-model="form.title" :placeholder="kindPlaceholder" maxlength="60" />
        </template>
        <template v-else>
          <label for="publish-route">出行线路</label>
          <select v-if="!fixedRouteId" id="publish-route" class="select" v-model.number="form.routeId" :disabled="!routesReady" @change="onRoute">
            <option :value="0">{{ routesReady ? (routes.length ? '选择一条心仪的线路' : '暂无可用线路') : '正在加载精选线路…' }}</option>
            <option v-for="item in routes" :key="item.id" :value="item.id">{{ item.title }}</option>
          </select>
          <div v-if="routeLoading" class="publish-loading">正在读取线路安排…</div>
          <div v-if="routePublishError" class="publish-route-error" role="alert">{{ routePublishError }}<button type="button" :disabled="routeLoading" @click="loadInitial">重新加载线路</button></div>
          <div v-else-if="selectedRoute" class="publish-route-preview">
            <img v-if="selectedRoute.cover" :src="selectedRoute.cover" :alt="selectedRoute.title" />
            <div><span>{{ selectedRoute.region || selectedRoute.city || '北京周边' }} · {{ selectedRoute.days || 1 }} 日游</span><strong>{{ selectedRoute.title }}</strong><small>{{ selectedRoute.difficulty || '休闲' }} · {{ selectedRoute.minGroupSize || 10 }} 人起成团</small></div>
          </div>
          <p v-if="!routesReady && !loading" class="publish-help">线路资料准备好后，就可以开始邀请大家。</p>
        </template>
        <div class="publish-fields" :class="{ paired: isActivity }">
          <div><label for="publish-date">{{ isActivity ? '活动日期' : '出发日期' }}</label><input id="publish-date" class="input" type="date" v-model="form.startDate" :min="today" /></div>
          <div v-if="isActivity"><label for="publish-time">开始时间</label><input id="publish-time" class="input" type="time" v-model="form.meetupTime" /></div>
        </div>
        <template v-if="!isActivity">
          <label for="publish-offer">选择团型</label>
          <select id="publish-offer" class="select" v-model="form.offerType"><option v-for="offer in offers" :key="offer.key" :value="offer.key">{{ offer.label }}</option></select>
          <div v-if="form.offerType === 'combo'" class="publish-inset">
            <p class="publish-help">组合团由已认证学生或学生组织发起，匹配另一半一起出发。</p>
            <label for="publish-combo">另一半身份</label><select id="publish-combo" class="select" v-model="form.comboRule.require"><option value="student_or_group">学生或学生组织</option><option value="student">已认证学生</option><option value="group">已认证学生组织</option></select>
            <label>另一半学校 · 选填</label><CampusNamePicker v-model="form.comboRule.school" kind="school" title="选择另一半学校" placeholder="不限学校" />
          </div>
        </template>
      </section>

      <section v-show="step === 1" class="publish-card">
        <div class="publish-card-title"><span>02</span><div><h2>{{ isActivity ? '把见面的细节定下来' : '和谁一起，走得更远' }}</h2><p>{{ isActivity ? '地点明确，大家更容易找到彼此' : '支持个人、高校和企业一起出发' }}</p></div></div>
        <template v-if="isActivity">
          <label for="publish-district">所在城区</label><select id="publish-district" class="select" v-model="form.city"><option value="">选择城区</option><option v-for="name in districts" :key="name" :value="name">{{ name }}</option></select>
          <label for="publish-place">具体集合地点</label><input id="publish-place" class="input" v-model="form.meetupPoint" placeholder="例如：朝阳公园南门，咖啡店门口" maxlength="120" />
          <div class="publish-fields paired"><div><label for="publish-activity-min">几人成局</label><input id="publish-activity-min" class="input" type="number" min="1" step="1" v-model.number="form.minGroupSize" /></div><div><label for="publish-max">人数上限</label><input id="publish-max" class="input" type="number" min="1" step="1" v-model.number="form.maxSeats" /></div></div>
          <label for="publish-price">每人费用 · 元</label><input id="publish-price" class="input" type="number" min="0" step="0.01" v-model.number="form.originPrice" /><p class="publish-help">免费活动填 0；收费活动请在介绍中写清费用包含项。</p>
        </template>
        <template v-else>
          <div class="publish-organizers" role="group" aria-label="发起人类型">
            <button v-for="kind in organizerKinds" :key="kind.key" type="button" :class="{ selected: form.organizerType === kind.key }" @click="form.organizerType = kind.key"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="kind.icon" /></svg><strong>{{ kind.label }}</strong><small>{{ kind.hint }}</small></button>
          </div>
          <template v-if="form.organizerType === 'company'"><label for="publish-company">发起公司</label><input id="publish-company" class="input" v-model="form.companyName" placeholder="请填写公司全称" maxlength="80" /><div class="publish-notice"><strong>企业出行，统一安排</strong><p>成员先报名占座，出行费用由公司统一结算。可在下一步开启口令，邀请同事加入。</p></div></template>
          <template v-if="form.organizerType === 'campus'"><label>发起学校</label><CampusNamePicker v-model="form.companyName" kind="school" title="选择发起学校" placeholder="搜索并选择学校" /><p class="publish-help">发起学校会展示在团页，下方设置实际开放的报名范围。</p><CampusAudienceFields v-model="form" :profile="store.profile || {}" /></template>
          <div v-if="form.organizerType === 'individual'" class="publish-notice"><strong>一个人发起，一群人同行</strong><p>分享给朋友，也欢迎同路的人加入。报名先占座，团费在出行前支付。</p></div>
        </template>
      </section>

      <section v-show="step === 2" class="publish-card">
        <div class="publish-card-title"><span>03</span><div><h2>{{ isActivity ? '让大家对这次见面有期待' : '出行安排，提前说清楚' }}</h2><p>{{ isActivity ? '写下活动安排与需要携带的物品' : '集合、座位与邀请方式，一次安排妥当' }}</p></div></div>
        <template v-if="!isActivity">
          <label for="publish-bus">出行车型</label><select id="publish-bus" class="select" v-model="form.busTypeId"><option value="">选择车型</option><option v-for="bus in buses" :key="bus.id" :value="bus.id">{{ bus.name }} · {{ bus.seats }} 座</option></select>
          <label for="publish-min">最低成团人数</label><div class="publish-number"><input id="publish-min" class="input" type="number" min="1" :max="selectedBus?.seats" step="1" v-model.number="form.minGroupSize" /><span>人<span v-if="selectedBus"> / 最多 {{ selectedBus.seats }} 人</span></span></div>
          <label for="publish-meetup">集合地点</label><select id="publish-meetup" class="select" v-model="form.meetupPoint"><option v-for="point in meetups" :key="point" :value="point">{{ point }}</option></select>
          <label for="publish-meetup-time">集合时间</label><input id="publish-meetup-time" class="input" type="time" v-model="form.meetupTime" />
          <template v-if="form.organizerType === 'campus'"><div class="publish-switch"><div><strong>超额报名抽签</strong><small>{{ form.offerType === 'free' ? '高校免费团自动开启' : '报名超出座位时抽签确认，未超则全部确认' }}</small></div><el-switch v-model="form.oversub" :disabled="form.offerType === 'free'" aria-label="超额报名抽签" /></div><details class="publish-advanced"><summary>更多报名设置 <span>男女比例</span></summary><GenderRatioFields v-model="form.genderRatio" :targets="resolvedTargets" /></details></template>
          <template v-if="tags.length"><label>想怎么玩 · 可多选</label><div class="publish-tags"><button v-for="tag in tags" :key="tag.id" type="button" :class="{ selected: form.playTagIds.includes(tag.id) }" @click="toggleTag(tag.id)">{{ tag.name }}</button></div></template>
        </template>
        <template v-else><label for="publish-description">活动介绍</label><textarea id="publish-description" class="input" v-model="form.description" rows="5" placeholder="怎么玩、费用包含什么、需要带什么，写给未来的同行者…" maxlength="2000" /></template>
        <div class="publish-switch"><div><strong>凭口令加入</strong><small>适合企业、社团或好友定向邀请</small></div><el-switch v-model="form.privateJoin" aria-label="凭口令加入" /></div>
        <template v-if="form.privateJoin"><label for="publish-code">入团口令 · 选填</label><input id="publish-code" class="input" v-model="form.joinCode" maxlength="16" placeholder="4～16 个字，留空自动生成" autocomplete="off" /><p class="publish-help">口令团会展示在列表中，报名时需要填写口令。</p></template>
        <label for="publish-notes">给同行者的话 · 选填</label><textarea id="publish-notes" class="input" v-model="form.notes" rows="3" maxlength="2000" placeholder="例如：欢迎新朋友，记得带一份好心情。" />
      </section>

      <section v-show="step === 3" class="publish-card publish-review">
        <div class="publish-card-title"><span>04</span><div><h2>好风景，就差你们了</h2><p>再看一眼，准备邀请同行者</p></div></div>
        <div class="publish-review-heading"><span>{{ isActivity ? '同城小聚' : organizerKinds.find(kind => kind.key === form.organizerType)?.label }}</span><h3>{{ isActivity ? form.title : selectedRoute?.title }}</h3></div>
        <dl class="publish-summary"><div><dt>{{ isActivity ? '活动日期' : '出发日期' }}</dt><dd>{{ form.startDate }}{{ isActivity ? ' · ' + form.meetupTime : '' }}</dd></div><div><dt>集合安排</dt><dd>{{ form.meetupPoint }}{{ !isActivity ? ' · ' + form.meetupTime : '' }}</dd></div><div><dt>人数安排</dt><dd>{{ form.minGroupSize }} 人{{ isActivity ? '成局' : '成团' }} · 上限 {{ isActivity ? form.maxSeats : selectedBus?.seats }} 人</dd></div><div v-if="!isActivity"><dt>团型 / 车型</dt><dd>{{ offers.find(offer => offer.key === form.offerType)?.label }} · {{ selectedBus?.name }}</dd></div><div v-if="!isActivity && form.offerType === 'free'"><dt>每人费用</dt><dd>免费</dd></div><div v-else-if="!isActivity && routePrice"><dt>参考价格</dt><dd>¥{{ routePrice.price }} / 人<span v-if="form.memberPriceOn"> · 会员 ¥{{ routePrice.memberPrice }}</span><span v-if="form.studentPriceOn"> · 学生 ¥{{ routePrice.studentPrice }}</span></dd></div><div v-else-if="isActivity"><dt>每人费用</dt><dd>{{ Number(form.originPrice) ? '¥' + form.originPrice : '免费' }}</dd></div><div v-if="form.organizerType !== 'individual' && !isActivity"><dt>发起{{ form.organizerType === 'campus' ? '学校' : '公司' }}</dt><dd>{{ form.companyName }}</dd></div><div v-if="form.organizerType === 'campus' && !isActivity"><dt>报名范围</dt><dd>{{ audienceSummary }}</dd></div><div><dt>加入方式</dt><dd>{{ form.privateJoin ? '凭口令报名' : '公开报名' }}</dd></div></dl>
        <div class="publish-notice"><strong>{{ isActivity ? '提交后，等待运营审核' : '发布后，分享邀请同行' }}</strong><p>{{ isActivity ? '活动审核通过后开放报名。你可以在活动详情中查看审核状态。' : form.organizerType === 'company' ? '成员报名后，由公司统一结算团费。发布成功后可分享团页邀请同事。' : '报名先占座，出行前付款。发布成功后可分享团页，随时查看报名进度。' }}</p></div>
      </section>

      <div v-if="err" class="publish-error" role="alert">{{ err }}<button v-if="!isActivity && (!routes.length || (form.routeId && !selectedRoute))" type="button" :disabled="routeLoading" @click="loadInitial">重新加载</button></div>
      <div class="publish-actions"><button v-if="step > 0" class="publish-back" type="button" :disabled="loading" @click="goStep(step - 1)">上一步</button><button class="btn publish-next" type="submit" :disabled="loading || routeLoading || (!isActivity && !routesReady)">{{ loading ? '正在发布…' : step < 3 ? '下一步' : isActivity ? '提交活动审核' : '发布并邀请同行' }}<span v-if="!loading && step < 3" aria-hidden="true">→</span></button></div>
      <p class="publish-footer">{{ step < 3 ? '每一步，都让出发更安心' : '同行者众 · 在山野，遇见爱' }}</p>
    </form>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { OFFER_TYPES } from "@/utils/offer";
import { ACTIVITY_KINDS } from "@/utils/activityKind";
import { todayYmd } from "@/utils/trips";
import CampusAudienceFields from "@/components/CampusAudienceFields.vue";
import CampusNamePicker from "@/components/CampusNamePicker.vue";
import GenderRatioFields from "@/components/GenderRatioFields.vue";
import { emptyGenderRatio } from "@/utils/genderRatio";
import { campusAudienceSummary, campusTargetsForPlan, prepareActivityPayload, prepareSchedulePayload, validatePublishPlan } from "@/utils/publishPlan";

const props = defineProps({ fixedRouteId: { type: Number, default: 0 } });
const route = useRoute();
const router = useRouter();
const store = useUserStore();
const buses = ref([]);
const allBuses = ref([]);
const routes = ref([]);
const tags = ref([]);
const routesReady = ref(false);
const routeLoading = ref(false);
const selectedRoute = ref(null);
const err = ref("");
const loading = ref(false);
const step = ref(0);
const today = todayYmd();
const offers = OFFER_TYPES;
const kinds = ACTIVITY_KINDS;
const organizerKinds = [
  { key: "individual", label: "个人发起", hint: "朋友相约", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M17 11h6" },
  { key: "campus", label: "高校发起", hint: "跨校跨院", icon: "m2 9 10-6 10 6-10 6-10-6M6 12v6c4 3 8 3 12 0v-6M22 10v7" },
  { key: "company", label: "企业发起", hint: "公司团建", icon: "M3 21V8h10v13M13 12h8v9M1 21h22M6 11h4M6 15h4M6 18h4M16 15h2M16 18h2M6 8V3h7v5" },
];
const districts = ["东城", "西城", "朝阳", "海淀", "丰台", "石景山", "通州", "顺义", "昌平", "大兴", "房山", "门头沟", "怀柔", "平谷", "密云", "延庆"];
const defaultMeetups = ["东直门东方银座C口", "西直门凯德mall北门外", "国贸桥下大巴停靠点", "丽泽桥西南角"];
const meetups = ref(defaultMeetups.slice());
const queryKind = String(route.query.kind || "");
const queryTitle = String(route.query.title || "");
const startAsActivity = !props.fixedRouteId && (route.query.channel === "activity" || kinds.some(kind => kind.key === queryTitle || kind.key === queryKind));
const requestedType = String(route.query.type || route.query.organizerType || "individual");
const organizerType = organizerKinds.some(kind => kind.key === requestedType) ? requestedType : "individual";
const organizationNames = { company: store.profile?.companyName || "", campus: store.profile?.school || "", individual: "" };
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const form = ref({
  channel: startAsActivity ? "activity" : "trip", title: queryTitle && !kinds.some(kind => kind.key === queryTitle) ? queryTitle : queryKind || queryTitle,
  activityKind: kinds.some(kind => kind.key === queryKind) ? queryKind : kinds.some(kind => kind.key === queryTitle) ? queryTitle : "掼蛋",
  routeId: props.fixedRouteId || Number(route.query.routeId) || 0, startDate: String(route.query.date || todayYmd(tomorrow)),
  organizerType, companyName: organizationNames[organizerType], busTypeId: "", minGroupSize: startAsActivity ? 4 : 10,
  maxSeats: 12, meetupPoint: startAsActivity ? "" : defaultMeetups[0], meetupTime: startAsActivity ? "19:30" : "07:30",
  city: startAsActivity ? "朝阳" : "", offerType: startAsActivity ? "free" : "full", originPrice: 0, playTagIds: [],
  studentOnly: false, alumniOk: false, oversub: false, genderRatio: emptyGenderRatio(),
  campusScope: "school", campusSchool: store.profile?.school || "", campusCollege: store.profile?.college || "", colleges: "", campusTargets: [],
  privateJoin: false, joinCode: "", description: "", notes: "", comboRule: { require: "student_or_group", school: "" }, memberPriceOn: true, studentPriceOn: true,
});
const postedId = ref(0);
const isActivity = computed(() => form.value.channel === "activity");
const stepNames = computed(() => isActivity.value ? ["活动灵感", "见面安排", "活动说明", "确认提交"] : ["选择线路", "邀请同行", "出行安排", "确认发布"]);
const selectedBus = computed(() => buses.value.find(bus => String(bus.id) === String(form.value.busTypeId)));
const routePrice = computed(() => selectedRoute.value?.priceTiers?.[0] || (selectedRoute.value?.fromPrice ? { price: selectedRoute.value.fromPrice, memberPrice: selectedRoute.value.memberFromPrice, studentPrice: selectedRoute.value.studentFromPrice } : null));
const routePublishError = computed(() => {
  if (!selectedRoute.value) return "";
  if (selectedRoute.value.status && selectedRoute.value.status !== "on") return selectedRoute.value.reviewStatus === "rejected" ? "这条线路未通过审核，目前不能发布排期。" : "这条线路尚未通过审核，目前不能发布排期。";
  if (selectedRoute.value.reviewStatus && selectedRoute.value.reviewStatus !== "approved") return selectedRoute.value.reviewStatus === "rejected" ? "这条线路未通过审核，目前不能发布排期。" : "这条线路尚未通过审核，目前不能发布排期。";
  return "";
});
const resolvedTargets = computed(() => campusTargetsForPlan(form.value));
const audienceSummary = computed(() => campusAudienceSummary(form.value));
const kindPlaceholder = computed(() => `例如：周五${kinds.find(kind => kind.key === form.value.activityKind)?.label || '同城'}小聚`);

watch(() => form.value.organizerType, (next, prev) => {
  if (prev) organizationNames[prev] = form.value.companyName;
  form.value.companyName = organizationNames[next] || "";
  if (next === "campus" && !form.value.campusSchool) form.value.campusSchool = form.value.companyName;
});
watch(() => form.value.companyName, (next, prev) => {
  if (form.value.organizerType === "campus" && (!form.value.campusSchool || form.value.campusSchool === prev)) form.value.campusSchool = next;
});
watch(() => [form.value.organizerType, form.value.offerType], ([type, offer]) => {
  if (type === "campus" && offer === "free") {
    form.value.oversub = true;
    form.value.studentOnly = true;
    if (form.value.campusScope === "open") form.value.campusScope = "school";
  }
});

onMounted(loadInitial);
async function loadInitial() {
  if (!requireLogin(store, router, route)) return;
  err.value = "";
  try {
    if (isActivity.value) {
      const response = await http.get("/buses");
      allBuses.value = response.data || [];
      buses.value = allBuses.value;
      form.value.busTypeId = buses.value[0]?.id || "";
      routesReady.value = true;
      return;
    }
    const results = await Promise.allSettled([http.get("/buses"), http.get("/routes"), http.get("/play-tags")]);
    if (results[0].status === "fulfilled") allBuses.value = results[0].value.data || [];
    if (results[1].status === "fulfilled") routes.value = results[1].value.data || [];
    else if (!props.fixedRouteId) throw results[1].reason;
    if (results[2].status === "fulfilled") tags.value = results[2].value.data || [];
    buses.value = allBuses.value;
    form.value.busTypeId = buses.value[0]?.id || "";
    if (form.value.routeId) await onRoute();
  } catch (error) {
    err.value = error.message || "线路加载失败，请刷新后重试";
  } finally {
    routesReady.value = true;
  }
}

let routeRequest = 0;
async function onRoute() {
  const request = ++routeRequest;
  const id = Number(form.value.routeId);
  selectedRoute.value = null;
  if (!id) { routeLoading.value = false; buses.value = allBuses.value; return; }
  routeLoading.value = true;
  err.value = "";
  try {
    const detail = (await http.get("/routes/" + id)).data || {};
    if (request !== routeRequest) return;
    selectedRoute.value = detail;
    buses.value = detail.buses?.length ? detail.buses : allBuses.value;
    if (!buses.value.some(bus => String(bus.id) === String(form.value.busTypeId))) form.value.busTypeId = buses.value[0]?.id || "";
    const points = (detail.meetupPoints || []).map(point => point.name).filter(Boolean);
    meetups.value = points.length ? points : defaultMeetups.slice();
    form.value.meetupPoint = meetups.value[0];
    form.value.minGroupSize = Number(detail.minGroupSize) || 10;
  } catch (error) {
    if (request === routeRequest) err.value = error.message || "线路资料加载失败";
  } finally {
    if (request === routeRequest) routeLoading.value = false;
  }
}
function pickKind(key) {
  const prev = form.value.activityKind;
  form.value.activityKind = key;
  if (!form.value.title || form.value.title === prev) form.value.title = key;
}
function toggleTag(id) { form.value.playTagIds = form.value.playTagIds.includes(id) ? form.value.playTagIds.filter(value => value !== id) : [...form.value.playTagIds, id]; }
function focusCard() { document.querySelector(".publish-page")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
function goStep(next) { if (loading.value || next > step.value) return; step.value = next; err.value = ""; focusCard(); }
async function advance() {
  if (loading.value || routeLoading.value) return;
  err.value = validatePublishPlan(form.value, { step: step.value < 3 ? step.value : undefined, today: todayYmd(), buses: buses.value, profile: store.profile || {} });
  if (err.value) return;
  if (!isActivity.value && !selectedRoute.value) { err.value = "请重新选择线路，等待线路资料加载完成"; step.value = 0; return; }
  if (!isActivity.value && routePublishError.value) { err.value = routePublishError.value; step.value = 0; return; }
  if (step.value < 3) { step.value += 1; focusCard(); return; }
  if (!requireLogin(store, router, route)) return;
  loading.value = true;
  try {
    const payload = isActivity.value ? prepareActivityPayload(form.value) : prepareSchedulePayload(form.value);
    const response = await http.post(isActivity.value ? "/trips" : "/schedules", payload);
    postedId.value = Number(response.data.id) || 0;
    if (postedId.value) await router.replace("/m/schedule/" + postedId.value + "?posted=1");
  } catch (error) {
    err.value = error.message || "发布失败，请稍后再试";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.publish-page { color:#2f2837; padding-bottom:8px; }
.publish-intro { padding:14px 2px 21px; }
.publish-eyebrow { color:#9b8cae; font-size:10px; letter-spacing:3px; }
.publish-intro h1 { margin:9px 0 8px; font-size:23px; font-weight:650; line-height:1.4; }
.publish-intro p { margin:0; color:#938a9c; font-size:12px; line-height:1.7; }
.publish-steps { display:flex; gap:0; margin:0 0 22px; position:relative; }
.publish-steps:before { content:''; height:1px; background:#e4ddec; position:absolute; left:12%; right:12%; top:15px; }
.publish-steps button { flex:1; background:none; border:none; display:flex; align-items:center; flex-direction:column; gap:7px; position:relative; padding:0; cursor:pointer; color:#a79eaf; }
.publish-steps button > span { display:flex; align-items:center; justify-content:center; background:#ece8f1; color:#9d90aa; border:3px solid #f6f5f8; border-radius:50%; width:32px; height:32px; font-size:10px; font-weight:600; }
.publish-steps button.active > span { background:#5b3b8c; color:#fff; box-shadow:0 0 0 3px #ece5f4; }
.publish-steps button.done > span { color:#5b3b8c; background:#e6ddef; }
.publish-steps small { font-size:11px; }
.publish-steps .active small { color:#5b3b8c; font-weight:600; }
.publish-card { background:#fff; border:1px solid #efeaf4; border-radius:20px; padding:21px 18px 14px; box-shadow:0 5px 25px #4d306407; }
.publish-card-title { display:flex; gap:11px; align-items:center; margin-bottom:24px; }
.publish-card-title > span { color:#c2b1d5; font-family:Georgia,serif; font-size:32px; font-style:italic; line-height:1; }
.publish-card-title h2 { margin:0; font-size:17px; font-weight:600; }
.publish-card-title p { margin:5px 0 0; color:#a49aaa; font-size:11px; line-height:1.5; }
.publish-success { text-align:center; padding:30px 20px; background:#fff; border:1px solid #eee7f3; border-radius:18px; }
.publish-success > span { display:inline-grid; width:42px; height:42px; place-items:center; border-radius:50%; background:#edf4ee; color:#45764e; }
.publish-success h2 { margin:14px 0 6px; font-size:18px; }
.publish-success p { color:#91879b; font-size:12px; line-height:1.7; }
.publish-success .btn { display:inline-block; margin-top:10px; background:#5b3b8c; border-radius:24px; padding:12px 28px; color:#fff; text-decoration:none; }
.publish-card label { display:block; font-size:12px; font-weight:550; color:#62546f; margin-top:13px; }
.publish-card :deep(.input), .publish-card .select { box-sizing:border-box; min-width:0; border:1px solid #eae5f0; border-radius:11px; background:#faf9fc; margin:7px 0 8px; min-height:45px; padding:11px 12px; color:#38303f; font-size:13px; box-shadow:none; }
.publish-card :deep(.input:focus), .publish-card .select:focus { outline:2px solid #e9dff4; border-color:#9376b2; }
.publish-fields.paired { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.publish-fields > div { min-width:0; }
.publish-route-preview { display:flex; align-items:center; gap:13px; border:1px solid #ebe5f2; border-radius:14px; overflow:hidden; padding:11px; margin:4px 0 13px; background:#fff; }
.publish-route-error { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; border:1px solid #f0e1d9; background:#fff8f3; color:#9b5b45; padding:12px; border-radius:11px; font-size:11px; line-height:1.7; }
.publish-route-error button { border:0; padding:0; background:none; color:#7d4b91; cursor:pointer; text-decoration:underline; font-size:11px; }
.publish-route-preview img { width:72px; height:86px; flex:none; object-fit:cover; border-radius:9px; }
.publish-route-preview > div { min-width:0; }
.publish-route-preview span { font-size:10px; color:#9a88ad; }
.publish-route-preview strong { display:block; font-size:15px; line-height:1.55; margin:4px 0; }
.publish-route-preview small { color:#94869f; font-size:10px; }
.publish-loading { color:#a396b1; font-size:12px; padding:15px 0; }
.publish-kinds { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin-bottom:20px; }
.publish-kinds button { display:flex; align-items:center; flex-direction:column; gap:9px; padding:12px 6px; border-radius:12px; border:1px solid #eae5ef; background:#fff; color:#796c85; cursor:pointer; }
.publish-kinds button span { font-size:20px; }
.publish-kinds button strong { font-size:12px; font-weight:500; }
.publish-kinds button.selected { border-color:#8a6cab; background:#f5effb; color:#5b3b8c; }
.publish-organizers { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-bottom:21px; }
.publish-organizers button { display:flex; align-items:center; flex-direction:column; padding:16px 3px 12px; background:#fff; border:1px solid #e9e3ef; border-radius:13px; color:#8e8199; cursor:pointer; }
.publish-organizers svg { width:26px; height:26px; margin-bottom:10px; }
.publish-organizers strong { font-size:12px; color:#5d4f69; font-weight:550; }
.publish-organizers small { font-size:10px; color:#a497ad; margin-top:4px; }
.publish-organizers .selected { background:#f4eefb; border-color:#9272b1; color:#5b3b8c; }
.publish-organizers .selected strong { color:#5b3b8c; }
.publish-notice { padding:15px; background:#f6f2fa; border-radius:12px; margin:16px 0 8px; }
.publish-notice strong { color:#6b4c8e; font-size:12px; font-weight:550; }
.publish-notice p { font-size:11px; color:#9b8aa9; line-height:1.8; margin:7px 0 0; }
.publish-help { font-size:11px; color:#a193ac; line-height:1.7; margin:2px 0 15px; }
.publish-inset { background:#fbf9fd; border-radius:12px; padding:11px; margin:10px 0; }
.publish-number { display:flex; align-items:center; gap:10px; }
.publish-number input { width:100px; flex:none; }
.publish-number > span { color:#8b7e96; font-size:12px; }
.publish-number > span > span { font-size:11px; color:#a79aae; }
.publish-switch { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 0; border-top:1px solid #f1edf5; margin-top:10px; }
.publish-switch strong { font-size:13px; font-weight:500; }
.publish-switch small { display:block; margin-top:4px; font-size:10px; color:#a094aa; line-height:1.6; }
.publish-advanced { padding:12px 0; border-top:1px solid #f0ebf4; }
.publish-advanced summary { cursor:pointer; font-size:12px; color:#71607e; }
.publish-advanced summary > span { float:right; font-size:10px; color:#a99bb3; }
.publish-tags { display:flex; flex-wrap:wrap; gap:7px; margin:10px 0 19px; }
.publish-tags button { border:1px solid #e9e2f1; padding:7px 13px; background:#fff; border-radius:20px; font-size:11px; color:#96849f; cursor:pointer; }
.publish-tags .selected { background:#f1eaf9; color:#5b3b8c; border-color:#b5a0ca; }
.publish-review-heading { border-bottom:1px solid #eee8f3; padding-bottom:18px; margin-bottom:2px; }
.publish-review-heading > span { display:inline-block; color:#8e74aa; background:#f3edf8; border-radius:4px; padding:3px 7px; font-size:10px; }
.publish-review-heading h3 { margin:9px 0 0; font-size:20px; font-weight:600; line-height:1.6; }
.publish-summary { margin:0 0 20px; }
.publish-summary > div { display:grid; grid-template-columns:78px minmax(0,1fr); gap:9px; border-bottom:1px solid #f4f1f7; padding:13px 0; font-size:12px; line-height:1.8; }
.publish-summary dt { color:#a093ac; }
.publish-summary dd { margin:0; color:#5a4a65; text-align:right; overflow-wrap:anywhere; }
.publish-actions { display:flex; gap:11px; padding:20px 0 0; }
.publish-back { flex:0 0 86px; border:1px solid #ded3e8; background:#fff; border-radius:24px; color:#8e769f; cursor:pointer; font-size:12px; }
.publish-next { display:flex; justify-content:center; align-items:center; gap:14px; flex:1; margin:0; min-height:48px; border:0; border-radius:26px; background:#5b3b8c; color:#fff; font-size:14px; font-weight:500; box-shadow:0 5px 15px #5b3b8c14; }
.publish-next:disabled { opacity:.5; cursor:default; }
.publish-next > span { font-size:19px; font-weight:300; }
.publish-footer { font-size:10px; color:#b3a7bd; text-align:center; letter-spacing:1px; margin:14px 0 8px; }
.publish-error { padding:12px 14px; background:#fff0f0; border-radius:10px; color:#b75a5a; font-size:12px; line-height:1.6; margin:14px 0 0; }
.publish-error button { border:0; background:transparent; color:#8b4c7e; cursor:pointer; text-decoration:underline; font-size:11px; margin-left:8px; padding:0; }
.publish-card :deep(.el-switch) { --el-switch-on-color:#6b4c91; --el-switch-off-color:#e3dce9; }
@media (min-width:700px) { .publish-intro h1 { font-size:28px; } .publish-card { padding:28px; } .publish-organizers button { padding:20px 10px; } }
</style>
