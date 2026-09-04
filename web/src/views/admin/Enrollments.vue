<template>
  <div>
    <div class="row">
      <h2>报名明细</h2>
      <div class="row" style="gap:8px">
        <el-input v-model="q" placeholder="姓名 / 手机 / 线路" clearable style="width:200px" @keyup.enter="load" />
        <el-select v-model="payStatus" clearable placeholder="支付状态" style="width:140px">
          <el-option label="待支付" value="unpaid" />
          <el-option label="已支付" value="paid" />
          <el-option label="公司挂账" value="company_pending" />
          <el-option label="已退款" value="refunded" />
        </el-select>
        <el-select v-model="status" clearable placeholder="报名状态" style="width:120px">
          <el-option label="有效" value="joined" />
          <el-option label="候补" value="waitlist" />
          <el-option label="已取消" value="cancelled" />
        </el-select>
        <el-button type="success" @click="load">查询</el-button>
      </div>
    </div>
    <p class="admin-scroll-hint">表格较宽时可左右滑动，操作在最右侧。</p>
    <el-table :data="list" stripe>
      <el-table-column prop="title" label="线路" min-width="160" />
      <el-table-column prop="start_date" label="日期" width="120" />
      <el-table-column prop="traveler_name" label="姓名" width="100" />
      <el-table-column prop="traveler_phone" label="手机" width="130" />
      <el-table-column label="紧急联系人" min-width="160">
        <template #default="{ row }">{{ row.emergency_name ? row.emergency_name + " " + (row.emergency_phone || "") : "—" }}</template>
      </el-table-column>
      <el-table-column label="性别" width="80">
        <template #default="{ row }">{{ genderText(row.gender) }}</template>
      </el-table-column>
      <el-table-column prop="hometown" label="籍贯" min-width="120" />
      <el-table-column label="支付" width="110">
        <template #default="{ row }">{{ payStatusText(row.pay_status) }}</template>
      </el-table-column>
      <el-table-column label="报名" width="90">
        <template #default="{ row }">{{ row.status === "cancelled" ? "已取消" : row.status === "waitlist" ? "候补" : "有效" }}</template>
      </el-table-column>
      <el-table-column prop="seat_no" label="座位" width="80" />
      <el-table-column label="保险" width="90">
        <template #default="{ row }">{{ row.insurance_code === "plus" ? "升级" : row.insurance_code === "outdoor" ? "意外" : "无" }}</template>
      </el-table-column>
      <el-table-column prop="pay_amount" label="金额" width="90" />
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button v-if="canOps" size="small" type="danger" :disabled="row.status === 'cancelled'" @click="cancel(row)">取消</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import http from "@/api/http";
import { genderText, payStatusText } from "@/utils/labels";
import { hasCap } from "@/utils/staff";

const list = ref([]);
const q = ref("");
const payStatus = ref("");
const status = ref("");
const me = ref({ caps: [] });
const canOps = computed(() => hasCap(me.value, "ops"));

onMounted(load);

async function load() {
  try {
    me.value = (await http.get("/admin/me")).data;
  } catch {
    me.value = { caps: [] };
  }
  list.value = (
    await http.get("/admin/enrollments", {
      params: { q: q.value, payStatus: payStatus.value, status: status.value },
    })
  ).data;
}

async function cancel(row) {
  try {
    await ElMessageBox.confirm(`取消「${row.traveler_name}」在「${row.title}」的报名？名额将释放，已付款会标记退款。`, "取消报名", {
      type: "warning",
    });
    await http.post(`/admin/enrollments/${row.id}/cancel`);
    ElMessage.success("已取消报名");
    await load();
  } catch (e) {
    if (e !== "cancel") ElMessage.error(e.message || "已取消");
  }
}
</script>
