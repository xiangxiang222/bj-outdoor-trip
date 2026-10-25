<template>
  <LoadRow v-if="!routeInfo" />
  <div v-else>
    <p>为「{{ routeInfo.title }}」发布一个可报名日期，可分享到微信群召集报名。</p>
    <label>出发日期</label>
    <input class="input" type="date" v-model="form.startDate" />
    <label>组织类型</label>
    <select class="select" v-model="form.organizerType">
      <option value="individual">个人开团（先报名，出行前付款）</option>
      <option value="company">公司开团（先报名，最后统一支付）</option>
      <option value="campus">高校开团（先报名，出行前付款）</option>
    </select>
      <label v-if="form.organizerType === 'company'">公司名称</label>
      <label v-if="form.organizerType === 'campus'">发起学校</label>
      <input
        v-if="form.organizerType === 'company'"
        class="input"
        v-model="form.companyName"
        placeholder="公司全称"
      />
      <CampusNamePicker
        v-if="form.organizerType === 'campus'"
        v-model="form.companyName"
        kind="school"
        title="选择学校"
        placeholder="例如：北京大学"
      />
      <p v-if="form.organizerType === 'campus'" class="muted">写在团上，表示哪个学校在组织，不限制谁能报名。</p>
    <label>大巴车型</label>
    <select class="select" v-model="form.busTypeId">
      <option v-for="b in buses" :key="b.id" :value="b.id">{{ b.name }}（{{ b.seats }}座）</option>
    </select>
    <label>最低成团人数</label>
    <input class="input" type="number" v-model.number="form.minGroupSize" />
    <label>集合点</label>
    <select class="select" v-model="form.meetupPoint">
      <option v-for="m in routeInfo.meetupPoints" :key="m.id" :value="m.name">{{ m.name }}</option>
    </select>
    <label>集合时间</label>
    <input class="input" v-model="form.meetupTime" />
    <label>团型</label>
    <select class="select" v-model="form.offerType">
      <option value="early">早鸟团</option>
      <option value="deal">特惠团</option>
      <option value="free">免费团</option>
      <option value="full">全价团</option>
    </select>
    <template v-if="form.organizerType === 'campus'">
      <div class="row"><span>仅师生</span><el-switch v-model="form.studentOnly" /></div>
      <div class="row"><span>允许校友</span><el-switch v-model="form.alumniOk" /></div>
      <div class="row"><span>超额抽签</span><el-switch v-model="form.oversub" /></div>
      <p class="muted">报名超过座位时抽签确认出行人，没超过就全部确认。</p>
      <p v-if="form.offerType === 'free'" class="muted">免费团如果报名范围留空，默认只让发起学校的师生报名。</p>
      <label>报名范围</label>
      <CampusTargetList v-model="form.campusTargets" v-model:ratio="form.genderRatio" />
      <p class="muted">谁可以报名。留空表示不限学校，也可以和发起学校不同。</p>
      <GenderRatioFields v-model="form.genderRatio" :targets="form.campusTargets" />
    </template>
    <label class="check-row"><input type="checkbox" v-model="form.privateJoin" /> 口令团（报名要口令）</label>
    <p class="muted">列表会显示「口令团」。把口令发给要来的人；不填则自动生成 6 位。</p>
    <input v-if="form.privateJoin" class="input" v-model="form.joinCode" maxlength="16" placeholder="4～16 个字，可空则自动生成" />
    <label>想怎么玩</label>
    <div class="chips">
      <div class="play-tag" v-for="t in tags" :key="t.id" :style="{ background: t.color, opacity: form.playTagIds.includes(t.id) ? 1 : 0.4 }" @click="toggleTag(t.id)">{{ t.name }}</div>
    </div>
    <label>备注</label>
    <textarea class="input" v-model="form.notes" rows="3" />
    <p v-if="err" style="color:var(--clay)">{{ err }}</p>
    <button class="btn block" @click="submit">发布排期</button>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import LoadRow from "@/components/LoadRow.vue";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import CampusTargetList from "@/components/CampusTargetList.vue";
import CampusNamePicker from "@/components/CampusNamePicker.vue";
import GenderRatioFields from "@/components/GenderRatioFields.vue";
import { applyCampusPublish, emptyGenderRatio } from "@/utils/genderRatio";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const routeInfo = ref(null);
const buses = ref([]);
const err = ref("");
const tags = ref([]);
const form = ref({
  startDate: "",
  organizerType: "individual",
  companyName: store.profile?.companyName || "",
  busTypeId: "",
  minGroupSize: 10,
  meetupPoint: "",
  meetupTime: "07:30",
  notes: "",
  offerType: "full",
  playTagIds: [],
  studentOnly: false,
  alumniOk: false,
  genderRatio: emptyGenderRatio(),
  oversub: false,
  campusScope: "open",
  campusSchool: store.profile?.school || "",
  campusCollege: store.profile?.college || "",
  schools: "",
  colleges: "",
  campusTargets: [],
  privateJoin: false,
  joinCode: "",
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

onMounted(async () => {
  if (!requireLogin(store, router, route)) return;
  routeInfo.value = (await http.get("/routes/" + route.params.id)).data;
  buses.value = routeInfo.value.buses || [];
  form.value.busTypeId = buses.value[0]?.id;
  form.value.minGroupSize = routeInfo.value.minGroupSize;
  form.value.meetupPoint = routeInfo.value.meetupPoints?.[0]?.name || "";
  tags.value = (await http.get("/play-tags")).data || [];
});

function toggleTag(id) {
  const ids = form.value.playTagIds;
  form.value.playTagIds = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

async function submit() {
  if (form.value.organizerType === "company" && !String(form.value.companyName || "").trim()) {
    err.value = "公司开团请填写公司名称";
    return;
  }
  if (form.value.organizerType === "campus" && !String(form.value.companyName || "").trim()) {
    err.value = "高校开团请填写学校";
    return;
  }
  try {
    const payload = applyCampusPublish({ ...form.value });
    const res = await http.post("/schedules", { routeId: Number(route.params.id), ...payload });
    router.push("/m/schedule/" + res.data.id);
  } catch (e) {
    err.value = e.message;
  }
}
</script>

<style scoped>
.row { display: flex; align-items: center; justify-content: space-between; min-height: 44px; gap: 12px; }
</style>
