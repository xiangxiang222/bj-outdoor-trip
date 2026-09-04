<template>
  <div>
    <div class="card" v-for="o in list" :key="o.id">
      <div class="pad tap" @click="goRoute(o)">
        <div class="row">
          <strong>{{ o.title }}</strong>
          <span class="tag">{{ o.status === "cancelled" ? "已取消" : o.start_date }}</span>
        </div>
        <div class="muted">{{ o.traveler_name }} · {{ enrollStatusText(o) }}<template v-if="o.seat_no"> · {{ o.seat_no }}座</template><template v-if="o.insurance_fee"> · 含保险 ¥{{ o.insurance_fee }}</template><template v-if="o.supplies_fee"> · 车上加购 ¥{{ o.supplies_fee }}</template></div>
        <div class="price">¥{{ o.pay_amount }}</div>
      </div>
      <div v-if="o.canCancel" class="pad" style="padding-top:0">
        <button class="btn ghost block" style="color:var(--clay)" :disabled="cancelling === o.id" @click.stop="cancel(o)">
          取消报名
        </button>
      </div>
      <div v-if="o.canComplete || o.completed" class="pad" style="padding-top:0">
        <button class="btn block" type="button" @click.stop="$router.push('/m/after/' + o.schedule_id)">
          {{ o.completed ? "评价 / 抽奖 / 评选" : "完成活动" }}
        </button>
      </div>
      <div v-if="o.canReview" class="pad" style="padding-top:0" @click.stop>
        <button v-if="reviewing !== o.id" class="btn ghost block" @click="openReview(o)">去评价</button>
        <div v-else>
          <div class="star-pick">
            <button
              v-for="n in 5"
              :key="n"
              type="button"
              :class="{ on: form.rating >= n }"
              @click="form.rating = n"
            >★</button>
          </div>
          <textarea class="input" v-model="form.content" rows="3" placeholder="这次出行怎么样（选填）" />
          <div style="display:flex;gap:8px">
            <button class="btn ghost" style="flex:1" @click="reviewing = 0">取消</button>
            <button class="btn" style="flex:1" :disabled="submitting" @click="submitReview(o)">提交评价</button>
          </div>
        </div>
      </div>
      <p v-else-if="o.reviewed" class="pad muted" style="padding-top:0">已评价</p>
    </div>
    <p v-if="!list.length" class="muted">暂无报名</p>
    <p v-if="msg" class="muted">{{ msg }}</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { enrollStatusText } from "@/utils/labels";
import { requireLogin } from "@/utils/auth";
const store = useUserStore();
const route = useRoute();
const router = useRouter();
const list = ref([]);
const msg = ref("");
const cancelling = ref(0);
const reviewing = ref(0);
const submitting = ref(false);
const form = ref({ rating: 5, content: "" });
onMounted(load);
async function load() {
  if (!requireLogin(store, router, route)) return;
  list.value = (await http.get("/orders")).data;
}
function goRoute(o) {
  if (o.route_id) router.push("/m/route/" + o.route_id);
}
function openReview(o) {
  reviewing.value = o.id;
  form.value = { rating: 5, content: "" };
  msg.value = "";
}
async function submitReview(o) {
  submitting.value = true;
  msg.value = "";
  try {
    await http.post("/reviews", {
      scheduleId: o.schedule_id,
      rating: form.value.rating,
      content: form.value.content,
    });
    reviewing.value = 0;
    await load();
    msg.value = "评价已提交";
  } catch (e) {
    msg.value = e.message || "评价失败";
  } finally {
    submitting.value = false;
  }
}
async function cancel(o) {
  if (!window.confirm("确定取消报名？名额将释放给其他人。已付款的会标记退款。")) return;
  cancelling.value = o.id;
  msg.value = "";
  try {
    await http.post(`/orders/${o.id}/cancel`);
    await load();
    msg.value = "已取消报名";
  } catch (e) {
    msg.value = e.message || "取消失败";
  } finally {
    cancelling.value = 0;
  }
}
</script>
