<template>
  <div>
    <div class="card" v-for="o in list" :key="o.id">
      <div class="pad tap" @click="goRoute(o)">
        <div class="row">
          <strong>{{ o.title }}</strong>
          <span class="tag">{{ o.status === "cancelled" ? "已取消" : o.start_date }}</span>
        </div>
        <div class="muted">{{ o.traveler_name }} · {{ enrollStatusText(o) }}<template v-if="o.seat_no"> · {{ o.seat_no }}座</template></div>
        <div class="price">¥{{ o.pay_amount }}</div>
      </div>
      <div v-if="o.canCancel" class="pad" style="padding-top:0">
        <button class="btn ghost block" style="color:var(--clay)" :disabled="cancelling === o.id" @click.stop="cancel(o)">
          取消报名
        </button>
      </div>
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
onMounted(load);
async function load() {
  if (!requireLogin(store, router, route)) return;
  list.value = (await http.get("/orders")).data;
}
function goRoute(o) {
  if (o.route_id) router.push("/m/route/" + o.route_id);
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
