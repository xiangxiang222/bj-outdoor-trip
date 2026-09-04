<template>
  <div v-if="routeInfo">
    <p>为「{{ routeInfo.title }}」发布一个可报名日期，可分享到微信群召集报名。</p>
    <label>出发日期</label>
    <input class="input" type="date" v-model="form.startDate" />
    <label>组织类型</label>
    <select class="select" v-model="form.organizerType">
      <option value="individual">个人开团（先报名，出行前付款）</option>
      <option value="company">公司开团（先报名，最后统一支付）</option>
    </select>
    <label v-if="form.organizerType === 'company'">公司名称</label>
    <input v-if="form.organizerType === 'company'" class="input" v-model="form.companyName" />
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
    <label class="check-row"><input type="checkbox" v-model="form.studentOnly" /> 仅已认证学生可报名</label>
    <label>限定高校（可空，逗号分隔）</label>
    <input class="input" v-model="form.schools" placeholder="例如：北京大学,清华大学" />
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
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";

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
  schools: "",
});

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
  try {
    const res = await http.post("/schedules", { routeId: Number(route.params.id), ...form.value });
    router.push("/m/schedule/" + res.data.id);
  } catch (e) {
    err.value = e.message;
  }
}
</script>
