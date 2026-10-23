<template>
  <div>
    <template v-if="isActivity">
      <label>玩法</label>
      <div class="act-kinds">
        <button
          class="act-kind"
          type="button"
          v-for="k in kinds"
          :key="k.key"
          :class="{ on: form.activityKind === k.key }"
          @click="pickKind(k.key)"
        >
          <span>{{ k.emoji }}</span>
          <em>{{ k.label }}</em>
          <small>{{ k.hint }}</small>
        </button>
      </div>
      <label>标题</label>
      <input class="input" v-model="form.title" :placeholder="kindPlaceholder" />
      <label>地点</label>
      <input class="input" v-model="form.meetupPoint" placeholder="例如：三里屯太古里南区" />
      <label>城区</label>
      <select class="select" v-model="form.city">
        <option value="">选择城区</option>
        <option v-for="name in districts" :key="name" :value="name">{{ name }}</option>
      </select>
      <label>日期</label>
      <input class="input" type="date" v-model="form.startDate" />
      <label>时间</label>
      <input class="input" type="time" v-model="form.meetupTime" />
      <label>最少几人成局</label>
      <input class="input" type="number" v-model.number="form.minGroupSize" />
      <label>人数上限</label>
      <input class="input" type="number" v-model.number="form.maxSeats" />
      <label>费用（元，0 为免费）</label>
      <input class="input" type="number" v-model.number="form.originPrice" />
      <label>介绍</label>
      <textarea class="input" v-model="form.description" rows="4" placeholder="带什么、几点开始、怎么找人" />
    </template>

    <template v-else>
      <div class="sheet">
        <div class="row"><span>线路</span>
          <select class="select" v-model.number="form.routeId" @change="onRoute">
            <option :value="0">{{ routes.length ? "选择已有线路" : "暂无可选线路" }}</option>
            <option v-for="r in routes" :key="r.id" :value="r.id">{{ r.title }}</option>
          </select>
        </div>
        <div class="row"><span>日期</span><input class="input" type="date" v-model="form.startDate" /></div>
        <div class="row"><span>类型</span>
          <select class="select" v-model="form.organizerType">
            <option value="individual">个人开团</option>
            <option value="company">公司开团</option>
            <option value="campus">高校开团</option>
          </select>
        </div>
        <div class="row" v-if="form.organizerType === 'company'"><span>公司名称</span><input class="input" v-model="form.companyName" placeholder="公司全称" /></div>
        <div class="row" v-if="form.organizerType === 'campus'"><span>发起学校</span>
          <CampusNamePicker v-model="form.companyName" kind="school" title="选择学校" placeholder="例如：北京大学" />
        </div>
        <p v-if="form.organizerType === 'campus'" class="hint">写在团上，表示哪个学校在组织，不限制谁能报名。</p>
        <div class="row"><span>车型</span>
          <select class="select" v-model="form.busTypeId">
            <option v-for="b in buses" :key="b.id" :value="b.id">{{ b.name }}（{{ b.seats }}座）</option>
          </select>
        </div>
        <div class="row"><span>成团人数</span><input class="input" type="number" v-model.number="form.minGroupSize" /></div>
        <div class="row"><span>集合点</span>
          <select class="select" v-model="form.meetupPoint">
            <option v-for="m in meetups" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
        <div class="row"><span>集合时间</span><input class="input" type="time" v-model="form.meetupTime" /></div>
        <div class="row"><span>团型</span>
          <select class="select" v-model="form.offerType">
            <option v-for="o in offers" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
        </div>
        <div v-if="form.offerType === 'combo'" class="combo">
          <p class="hint">组合团只对学生或已认证学生组织开放。</p>
          <div class="row"><span>另一半身份</span>
            <select class="select" v-model="form.comboRule.require">
              <option value="student_or_group">学生或学生组织</option>
              <option value="student">仅已认证学生</option>
              <option value="group">仅已认证学生组织</option>
            </select>
          </div>
          <div class="row"><span>另一半学校</span>
            <CampusNamePicker v-model="form.comboRule.school" kind="school" title="选择学校" placeholder="可空" />
          </div>
        </div>
        <template v-if="form.organizerType === 'campus'">
          <div class="row"><span>仅师生</span><el-switch v-model="form.studentOnly" /></div>
          <div class="row"><span>允许校友</span><el-switch v-model="form.alumniOk" /></div>
          <div class="row"><span>超额抽签</span><el-switch v-model="form.oversub" /></div>
          <p class="hint">报名超过座位时抽签确认出行人，没超过就全部确认。</p>
          <p v-if="form.offerType === 'free'" class="hint">免费团如果报名范围留空，默认只让发起学校的师生报名。</p>
          <div class="scope">
            <div class="scope-h"><span>报名范围</span></div>
            <p class="hint">谁可以报名。留空表示不限学校，也可以和发起学校不同。</p>
            <CampusTargetList v-model="form.campusTargets" />
          </div>
          <div class="scope">
            <GenderRatioFields v-model="form.genderRatio" :targets="form.campusTargets" />
          </div>
        </template>
        <div class="row"><span>口令团</span><el-switch v-model="form.privateJoin" /></div>
        <div class="row" v-if="form.privateJoin"><span>入团口令</span><input class="input" v-model="form.joinCode" maxlength="16" placeholder="4～16 个字，可空则自动生成" /></div>
        <div class="note"><span>备注</span><textarea class="input" v-model="form.notes" rows="2" placeholder="选填" /></div>
      </div>
    </template>

    <template v-if="isActivity">
      <div class="row switch-line"><span>口令团</span><el-switch v-model="form.privateJoin" /></div>
      <input v-if="form.privateJoin" class="input" v-model="form.joinCode" maxlength="16" placeholder="4～16 个字，可空则自动生成" />
    </template>

    <p v-if="err" style="color:var(--clay)">{{ err }}</p>
    <button class="btn block" :disabled="loading" @click="submit">{{ loading ? "提交中…" : (isActivity ? "提交审核" : "发布") }}</button>
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
import CampusTargetList from "@/components/CampusTargetList.vue";
import CampusNamePicker from "@/components/CampusNamePicker.vue";
import GenderRatioFields from "@/components/GenderRatioFields.vue";
import { applyCampusPublish, emptyGenderRatio } from "@/utils/genderRatio";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const buses = ref([]);
const err = ref("");
const loading = ref(false);
const offers = OFFER_TYPES;
const defaultMeetups = ["东直门东方银座C口", "西直门凯德mall北门外", "国贸桥下大巴停靠点", "丽泽桥西南角"];
const meetups = ref(defaultMeetups.slice());
const routes = ref([]);
const districts = ["东城", "西城", "朝阳", "海淀", "丰台", "石景山", "通州", "顺义", "昌平", "大兴", "房山", "门头沟", "怀柔", "平谷", "密云", "延庆"];
const kinds = ACTIVITY_KINDS;

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return todayYmd(d);
}

const queryKind = String(route.query.kind || "");
const queryTitle = String(route.query.title || "");
const startAsActivity = route.query.channel === "activity" || kinds.some((k) => k.key === queryTitle || k.key === queryKind);
const form = ref({
  title: queryTitle && !kinds.some((k) => k.key === queryTitle) ? queryTitle : queryKind || queryTitle,
  subtitle: "",
  cover: "",
  channel: startAsActivity ? "activity" : "trip",
  activityKind: kinds.some((k) => k.key === queryKind) ? queryKind : kinds.some((k) => k.key === queryTitle) ? queryTitle : startAsActivity ? "掼蛋" : "",
  days: 1,
  city: startAsActivity ? "朝阳" : "",
  playTagIds: [],
  routeId: 0,
  offerType: startAsActivity ? "free" : "full",
  originPrice: startAsActivity ? 0 : 199,
  offerPrice: null,
  memberPriceOn: true,
  studentPriceOn: true,
  studentOnly: false,
  alumniOk: false,
  oversub: false,
  genderRatio: emptyGenderRatio(),
  campusScope: "open",
  campusSchool: store.profile?.school || "",
  campusCollege: store.profile?.college || "",
  schools: "",
  colleges: "",
  campusTargets: [],
  startDate: route.query.date || tomorrow(),
  organizerType: "individual",
  companyName: store.profile?.companyName || "",
  busTypeId: "",
  minGroupSize: startAsActivity ? 4 : 10,
  maxSeats: 12,
  meetupPoint: startAsActivity ? "" : defaultMeetups[0],
  meetupTime: startAsActivity ? "19:30" : "07:30",
  description: "",
  videoUrls: "",
  notes: "",
  comboRule: { require: "student_or_group", school: "" },
  lotteryMode: "off",
  privateJoin: false,
  joinCode: "",
});
const isActivity = computed(() => form.value.channel === "activity");
const kindPlaceholder = computed(() => {
  const k = kinds.find((x) => x.key === form.value.activityKind);
  return k ? `例如：周五夜${k.label}` : "给这局起个名字";
});

watch(
  () => [form.value.organizerType, form.value.offerType, form.value.companyName],
  ([type, offer], prev = []) => {
    if (type === "campus" && !form.value.companyName && store.profile?.school) {
      form.value.companyName = store.profile.school;
    }
    if (type === "company" && !form.value.companyName && store.profile?.companyName) {
      form.value.companyName = store.profile.companyName;
    }
    const wasCampusFree = prev[0] === "campus" && prev[1] === "free";
    const isCampusFree = type === "campus" && offer === "free";
    if (isCampusFree && !wasCampusFree) {
      form.value.oversub = true;
      form.value.studentOnly = true;
    }
  }
);

watch(
  () => form.value.channel,
  (channel) => {
    if (channel === "activity") {
      form.value.offerType = "free";
      form.value.originPrice = 0;
      form.value.minGroupSize = 4;
      form.value.meetupTime = form.value.meetupTime || "19:30";
      form.value.city = form.value.city || "朝阳";
      form.value.startDate = form.value.startDate || tomorrow();
      form.value.activityKind = form.value.activityKind || "掼蛋";
      if (meetups.value.includes(form.value.meetupPoint)) form.value.meetupPoint = "";
    } else if (!form.value.meetupPoint) {
      form.value.meetupPoint = meetups.value[0];
      form.value.meetupTime = "07:30";
    }
  }
);

onMounted(async () => {
  if (!requireLogin(store, router, route)) return;
  const jobs = [http.get("/buses")];
  if (!startAsActivity) jobs.push(http.get("/routes"));
  const [busRes, routeRes] = await Promise.all(jobs);
  buses.value = busRes.data || [];
  form.value.busTypeId = buses.value[0]?.id || "";
  routes.value = routeRes?.data || [];
});

async function onRoute() {
  const id = Number(form.value.routeId);
  if (!id) return;
  try {
    const detail = (await http.get("/routes/" + id)).data || {};
    const points = (detail.meetupPoints || []).map((p) => p.name).filter(Boolean);
    if (points.length) {
      meetups.value = points;
      form.value.meetupPoint = points[0];
    }
    if (detail.minGroupSize) form.value.minGroupSize = detail.minGroupSize;
  } catch (ex) {
    err.value = ex.message;
  }
}

function pickKind(key) {
  const prev = form.value.activityKind;
  form.value.activityKind = key;
  if (!form.value.title || form.value.title === prev) form.value.title = key;
}

async function submit() {
  err.value = "";
  loading.value = true;
  try {
    const payload = { ...form.value };
    if (payload.channel === "activity") {
      payload.days = 1;
      payload.offerType = Number(payload.originPrice) > 0 ? payload.offerType || "full" : "free";
      payload.organizerType = "individual";
      if (!String(payload.meetupPoint || "").trim()) {
        err.value = "请填写地点";
        loading.value = false;
        return;
      }
      const res = await http.post("/trips", payload);
      router.push("/m/schedule/" + res.data.id + "?posted=1");
      return;
    }
    if (!payload.routeId) {
      err.value = "请选择线路";
      loading.value = false;
      return;
    }
    if (payload.organizerType === "company" && !String(payload.companyName || "").trim()) {
      err.value = "公司开团请填写公司名称";
      loading.value = false;
      return;
    }
    if (payload.organizerType === "campus" && !String(payload.companyName || "").trim()) {
      err.value = "高校开团请填写学校";
      loading.value = false;
      return;
    }
    applyCampusPublish(payload);
    const res = await http.post("/schedules", {
      routeId: Number(payload.routeId),
      startDate: payload.startDate,
      organizerType: payload.organizerType,
      companyName: payload.companyName,
      busTypeId: payload.busTypeId,
      minGroupSize: Number(payload.minGroupSize),
      meetupPoint: payload.meetupPoint,
      meetupTime: payload.meetupTime,
      offerType: payload.offerType,
      notes: payload.notes,
      studentOnly: payload.studentOnly,
      alumniOk: payload.alumniOk,
      oversub: payload.oversub,
      campusTargets: payload.campusTargets,
      genderRatio: payload.genderRatio,
      privateJoin: payload.privateJoin,
      joinCode: payload.joinCode,
      comboRule: payload.offerType === "combo" ? payload.comboRule : undefined,
    });
    router.push("/m/schedule/" + res.data.id + "?posted=1");
  } catch (e) {
    err.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.sheet { margin-top: 8px; background: #fff; border: 1px solid #f0e8e8; border-radius: 18px; overflow: hidden; }
.row { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 14px; border-bottom: 1px solid #f4f4f5; }
.row > span { width: 84px; flex: none; color: #3a3a3a; }
.row :deep(.el-switch) { margin-left: auto; }
.row .input, .row .select { flex: 1; margin: 0; text-align: right; background: transparent; border: 0; }
.hint { margin: 0; padding: 0 14px 10px; color: #8d8d8d; font-size: 13px; line-height: 1.5; }
.scope { padding: 12px 14px 4px; }
.scope-h { font-weight: 700; margin-bottom: 4px; }
.note { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px 16px; }
.note .input { margin: 0; }
.switch-line { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
</style>
