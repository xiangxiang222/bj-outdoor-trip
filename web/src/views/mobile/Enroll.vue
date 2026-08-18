<template>
  <div v-if="s">
    <div class="card"><div class="pad">
      <strong>{{ s.route.title }}</strong>
      <p class="muted">{{ s.startDate }} · {{ s.bus?.name }}</p>
      <p v-if="s.status === 'cancelled'" style="color:var(--clay)">本团已解散。理由：{{ s.cancelReason }}</p>
      <p v-else-if="s.remain <= 0">本车已满（{{ s.enrolled }}/{{ s.maxSeats }}）。仍可加入候补，有人取消后按顺序递补。</p>
      <p v-else-if="s.organizerType === 'company'">公司团：报名后挂账，由 {{ s.companyName || "公司" }} 统一支付。</p>
      <p v-else>个人拼团：先报名占座，费用待出行前支付。</p>
      <p class="price">当前档位 ¥{{ quote }} / 人</p>
    </div></div>

    <label>出行人姓名</label>
    <input class="input" v-model="form.travelerName" placeholder="与身份证一致" />
    <label>手机号</label>
    <input class="input" v-model="form.travelerPhone" placeholder="接收集合通知" />
    <label>身份证号</label>
    <input class="input" v-model="form.idCard" maxlength="18" placeholder="18位身份证号，末位数字或X" @blur="checkId" />
    <p v-if="idHint" :style="idOk ? '' : 'color:var(--clay)'" class="muted">{{ idHint }}</p>
    <label>类型</label>
    <select class="select" v-model="form.travelerType">
      <option value="adult">成人</option>
      <option value="child">儿童</option>
    </select>
    <div v-if="s.remain > 0 && seatRows.length" class="card"><div class="pad">
      <div class="h2" style="margin-top:0">选座位</div>
      <p class="muted">车头朝上，中间为过道。不选则自动分配空位。</p>
      <div class="seat-map">
        <div class="seat-front">车头</div>
        <div class="seat-row" v-for="row in seatRows" :key="row[0].row">
          <template v-for="seat in row" :key="seat.no">
            <button
              type="button"
              class="seat"
              :class="{ taken: seat.taken, on: form.seatNo === seat.no, mine: seat.mine }"
              :disabled="seat.taken"
              @click="form.seatNo = form.seatNo === seat.no ? '' : seat.no"
            >{{ seat.col }}</button>
            <i v-if="seat.aisleAfter" class="seat-aisle" />
          </template>
        </div>
      </div>
      <p class="muted">{{ form.seatNo ? "已选 " + form.seatNo : "未选座，将自动分配" }}</p>
    </div></div>
    <p class="muted">积分抵现将在付款时使用。</p>
    <p v-if="err" style="color:var(--clay)">{{ err }}</p>
    <button v-if="s.status !== 'cancelled'" class="btn block" style="margin-top:16px" :disabled="loading" @click="submit">
      {{ s.remain <= 0 ? "加入候补" : "加入报名（暂不付款）" }}
    </button>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { requireLogin } from "@/utils/auth";
import { parseIdCard } from "@/utils/idcard";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const s = ref(null);
const quote = ref(0);
const err = ref("");
const loading = ref(false);
const idHint = ref("");
const idOk = ref(false);
const form = ref({
  travelerName: store.profile?.nickname || "",
  travelerPhone: store.profile?.phone || "",
  idCard: "",
  travelerType: "adult",
  seatNo: "",
});
const seatChart = ref(null);
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

onMounted(async () => {
  if (!requireLogin(store, router, route)) return;
  s.value = (await http.get("/schedules/" + route.params.id)).data;
  quote.value = s.value.quote.price;
  try {
    seatChart.value = (await http.get("/schedules/" + route.params.id + "/seats")).data;
  } catch {
    seatChart.value = null;
  }
});

function checkId() {
  const parsed = parseIdCard(form.value.idCard);
  if (!form.value.idCard) {
    idHint.value = "";
    idOk.value = false;
    return parsed;
  }
  if (!parsed.valid) {
    idHint.value = parsed.error;
    idOk.value = false;
    return parsed;
  }
  form.value.idCard = parsed.idCard;
  idHint.value = `${parsed.gender === "female" ? "女" : "男"} · ${parsed.birthday}`;
  idOk.value = true;
  return parsed;
}

async function submit() {
  err.value = "";
  if (s.value.status === "cancelled") {
    err.value = "该拼团已解散，无法报名";
    return;
  }
  if (!form.value.travelerName || !form.value.travelerPhone) {
    err.value = "请填写出行人姓名和手机";
    return;
  }
  const parsed = checkId();
  if (!parsed.valid) {
    err.value = parsed.error;
    return;
  }
  loading.value = true;
  try {
    await http.post("/enroll", {
      scheduleId: Number(route.params.id),
      ...form.value,
      seatNo: form.value.seatNo || undefined,
    });
    router.push("/m/schedule/" + route.params.id);
  } catch (e) {
    err.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>
