<template>
  <div v-if="s">
    <div class="card"><div class="pad">
      <strong>{{ s.route.title }}</strong>
      <p class="muted">{{ s.startDate }} · {{ s.bus?.name }}</p>
      <p v-if="s.status === 'cancelled'" style="color:var(--clay)">本团已解散。理由：{{ s.cancelReason }}</p>
      <p v-else-if="s.remain <= 0">本车已满（{{ s.enrolled }}/{{ s.maxSeats }}）。仍可加入候补，有人取消后按顺序递补。</p>
      <p v-else-if="s.organizerType === 'company'">公司团：报名后挂账，由 {{ s.companyName || "公司" }} 统一支付。</p>
      <p v-else class="muted">个人拼团先报名占座，费用待出行前支付。早报名早选座。</p>
      <TripPrices v-if="s.quote" :quote="s.quote" />
      <p class="price">你应付 ¥{{ quote }} / 人</p>
      <p v-if="couponHint" class="muted" style="color:var(--leaf)">{{ couponHint }}</p>
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
    <label>报名身份</label>
    <select class="select" v-model="form.joinMode">
      <option value="chain">普通报名</option>
      <option value="assistant">辅助领队（免个人团费）</option>
      <option value="photographer">摄影师（免个人团费）</option>
    </select>
    <p class="muted"><router-link to="/m/official#rules">辅助领队 / 摄影师职责说明</router-link></p>
    <div v-if="s.combo?.enabled" class="card"><div class="pad">
      <div class="h2" style="margin-top:0">组合团 · 另一半条件</div>
      <p class="muted">本团只对学生或已认证学生组织开放。写下你希望另一半满足的条件，方便互相看见。</p>
      <p v-if="s.combo.rule?.school" class="muted">开团要求另一半来自 {{ s.combo.rule.school }}</p>
      <p v-if="!s.combo.canJoin" style="color:var(--clay)">请先完成学生或学生组织认证再报名。</p>
      <label>希望另一半</label>
      <select class="select" v-model="form.wantGender">
        <option value="any">不限</option>
        <option value="female">女生</option>
        <option value="male">男生</option>
      </select>
      <label>希望学校（可空）</label>
      <input class="input" v-model="form.wantSchool" placeholder="例如：清华大学" />
      <label>一句话</label>
      <input class="input" v-model="form.comboNote" placeholder="例如：想找同校第一次走长城" />
    </div></div>
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
              :class="{ taken: seat.taken, on: form.seatNo === seat.no, mine: seat.mine, locked: seat.locked }"
              :disabled="seat.taken"
              @click="form.seatNo = form.seatNo === seat.no ? '' : seat.no"
            >{{ seat.locked ? "锁" : seat.col }}</button>
            <i v-if="seat.aisleAfter" class="seat-aisle" />
          </template>
        </div>
      </div>
      <p class="muted">{{ form.seatNo ? "已选 " + form.seatNo : "未选座，将自动分配" }}</p>
    </div></div>
    <label>紧急联系人</label>
    <input class="input" v-model="form.emergencyName" placeholder="家人或同伴姓名" />
    <label>紧急联系人手机</label>
    <input class="input" v-model="form.emergencyPhone" maxlength="11" placeholder="不能与出行人同一号码" />
    <div v-if="supplyItems.length" class="card"><div class="pad">
      <div class="h2" style="margin-top:0">车上加购</div>
      <p class="muted">上车再买也行。先加上方便领队清点。费用计入应付。</p>
      <div v-for="p in supplyItems" :key="p.code" class="row" style="margin:8px 0">
        <span>
          <strong>{{ p.name }}</strong>
          <em> ¥{{ p.fee }}</em>
          <small class="muted"> {{ p.hint }}</small>
        </span>
        <span>
          <button class="btn ghost" type="button" @click="setQty(p.code, -1)">−</button>
          {{ supplyQty[p.code] || 0 }}
          <button class="btn ghost" type="button" @click="setQty(p.code, 1)">+</button>
        </span>
      </div>
    </div></div>
    <div v-if="plans.length" class="card"><div class="pad">
      <div class="h2" style="margin-top:0">出行保险</div>
      <label v-for="p in plans" :key="p.code" class="ins-opt">
        <input type="radio" :value="p.code" v-model="form.insuranceCode" />
        <span>
          <strong>{{ p.name }}</strong>
          <em v-if="p.fee"> +¥{{ p.fee }}</em>
          <small>{{ p.cover }}</small>
        </span>
      </label>
    </div></div>
    <div class="card"><div class="pad">
      <div class="h2" style="margin-top:0">行前确认</div>
      <p class="muted" style="white-space:pre-wrap">{{ waiver }}</p>
      <label class="check-row">
        <input type="checkbox" v-model="form.healthOk" />
        <span>本人身体健康，无心脏病、哮喘、癫痫等不适宜本次强度的疾病（或已告知领队并自行评估风险）。</span>
      </label>
      <label class="check-row">
        <input type="checkbox" v-model="form.waiverAccepted" />
        <span>已阅读风险告知与退改说明，自愿参加。</span>
      </label>
      <p class="muted">{{ cancelSummary }}</p>
    </div></div>
    <div class="card"><div class="pad">
      <div class="h2" style="margin-top:0">不成团时的备选</div>
      <label class="check-row">
        <input type="checkbox" v-model="form.autoAlt" />
        <span>如本团未成团，自动加入相同行程的其他日期（替代团）</span>
      </label>
      <p class="muted">也可多选候选团，解散后按顺序转团，价格多退少补。</p>
      <label class="check-row" v-for="opt in fallbackOptions" :key="opt.id">
        <input type="checkbox" :value="opt.id" v-model="form.fallbackScheduleIds" />
        <span>{{ opt.title }} {{ opt.startDate }}</span>
      </label>
    </div></div>
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
import TripPrices from "@/components/TripPrices.vue";

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const s = ref(null);
const quote = ref(0);
const couponHint = ref("");
const couponCode = ref("");
const err = ref("");
const loading = ref(false);
const idHint = ref("");
const idOk = ref(false);
const form = ref({
  travelerName: store.profile?.nickname || "",
  travelerPhone: store.profile?.phone || "",
  idCard: "",
  travelerType: "adult",
  joinMode: "chain",
  seatNo: "",
  insuranceCode: "outdoor",
  emergencyName: "",
  emergencyPhone: "",
  waiverAccepted: false,
  healthOk: false,
  autoAlt: false,
  fallbackScheduleIds: [],
  wantGender: "any",
  wantSchool: "",
  comboNote: "",
});
const fallbackOptions = ref([]);
const waiver = ref("");
const cancelSummary = ref("出发日前可取消；出发当天不可取消。解散则报名作废。");
const supplyItems = computed(() => store.meta?.supplies || []);
const supplyQty = ref({});
function setQty(code, delta) {
  const n = Math.min(10, Math.max(0, Number(supplyQty.value[code] || 0) + delta));
  supplyQty.value = { ...supplyQty.value, [code]: n };
}
const plans = computed(() =>
  store.meta?.insurance?.length
    ? store.meta.insurance
    : [
        { code: "none", name: "暂不购买", fee: 0, cover: "出行风险自担" },
        { code: "outdoor", name: "户外意外险", fee: 20, cover: "意外身故/伤残 10 万，医疗 2 万" },
        { code: "plus", name: "升级高额险", fee: 48, cover: "意外身故/伤残 50 万，医疗 5 万" },
      ]
);
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
  couponCode.value = String(route.query.coupon || "");
  if (couponCode.value) {
    try {
      const c = (await http.get("/coupons/" + couponCode.value)).data;
      const q = c.quote || {};
      if (q.applyCoupon) {
        quote.value = q.couponPay;
        couponHint.value = `已带优惠券 ${c.label}，团费 ¥${q.couponPay}（保险另计）`;
      } else {
        couponHint.value = q.reason || "当前价格不核销此券";
      }
    } catch (e) {
      couponHint.value = e.message || "优惠券不可用";
      couponCode.value = "";
    }
  }
  const opts = s.value.fallbackOptions || {};
  fallbackOptions.value = [...(opts.sameRoute || []), ...(opts.otherRecruiting || [])];
  try {
    const meta = (await http.get("/meta")).data;
    if (meta.insurance?.length) {
      /* plans computed from store; keep meta texts */
    }
    waiver.value = meta.waiverText || waiver.value;
    cancelSummary.value = meta.cancelPolicy?.summary || cancelSummary.value;
  } catch {
    /* use defaults */
  }
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
  if (!form.value.emergencyName || !form.value.emergencyPhone) {
    err.value = "请填写紧急联系人姓名和手机";
    return;
  }
  if (form.value.emergencyPhone === form.value.travelerPhone) {
    err.value = "紧急联系人不能与出行人使用同一手机号";
    return;
  }
  if (!form.value.healthOk) {
    err.value = "请确认健康状况适合本次活动";
    return;
  }
  if (!form.value.waiverAccepted) {
    err.value = "请阅读并确认户外活动风险告知";
    return;
  }
  loading.value = true;
  try {
    await http.post("/enroll", {
      scheduleId: Number(route.params.id),
      ...form.value,
      seatNo: form.value.seatNo || undefined,
      referrerCode: route.query.ref,
      couponCode: couponCode.value || undefined,
      supplies: supplyItems.value
        .map((p) => ({ code: p.code, qty: Number(supplyQty.value[p.code] || 0) }))
        .filter((p) => p.qty > 0),
    });
    router.push("/m/schedule/" + route.params.id + "?joined=1");
  } catch (e) {
    err.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>
