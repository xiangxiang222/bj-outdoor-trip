<template>
  <div>
    <div class="row">
      <h2>用户与会员</h2>
      <div class="row" style="gap:8px">
        <el-input v-model="q" placeholder="手机 / 昵称 / 公司" clearable style="width:240px" @keyup.enter="load" />
        <el-button type="success" @click="load">查询</el-button>
        <el-button @click="genVirtual">批量生成虚拟用户</el-button>
      </div>
    </div>
    <el-table :data="list" stripe>
      <el-table-column prop="nickname" label="昵称" min-width="120" />
      <el-table-column prop="phone" label="手机" width="130" />
      <el-table-column label="类型" width="80">
        <template #default="{ row }">{{ row.isVirtual ? "虚拟" : "真实" }}</template>
      </el-table-column>
      <el-table-column label="性别" width="80">
        <template #default="{ row }">{{ genderText(row.gender) }}</template>
      </el-table-column>
      <el-table-column label="会员" width="90">
        <template #default="{ row }">{{ row.isMember ? "有效" : row.is_member ? "已过期" : "否" }}</template>
      </el-table-column>
      <el-table-column prop="member_expire_at" label="到期" width="120" />
      <el-table-column prop="points" label="积分" width="80" />
      <el-table-column prop="company_name" label="公司" min-width="140" />
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="success" @click="grant(row)">{{ row.isMember ? "续费" : "开通" }}</el-button>
          <el-button v-if="row.isMember" size="small" @click="revoke(row)">取消会员</el-button>
          <el-button size="small" @click="openPoints(row)">积分</el-button>
          <el-button size="small" type="danger" @click="close(row)">注销</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showPoints" title="调整积分" width="420px">
      <p class="muted">{{ pointsRow?.nickname }} 当前 {{ pointsRow?.points }} 分</p>
      <el-form label-width="90px">
        <el-form-item label="变动">
          <el-input-number v-model="pointsForm.delta" :step="10" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="pointsForm.reason" placeholder="例如：活动补发 / 客服扣减" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPoints = false">取消</el-button>
        <el-button type="success" :loading="saving" @click="savePoints">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import http from "@/api/http";
import { genderText } from "@/utils/labels";

const list = ref([]);
const q = ref("");
const showPoints = ref(false);
const saving = ref(false);
const pointsRow = ref(null);
const pointsForm = ref({ delta: 10, reason: "" });

onMounted(load);

async function genVirtual() {
  try {
    await ElMessageBox.confirm("生成虚拟用户并随机加入招募中的团。真人数增加后，虚拟用户会自动退团腾座。", "批量虚拟用户", { type: "warning" });
    const res = await http.post("/admin/virtual-users", { count: 12, perSchedule: 3 });
    ElMessage.success(res.message || "已生成");
    await load();
  } catch (e) {
    if (e !== "cancel") ElMessage.error(e.message || "已取消");
  }
}

async function load() {
  list.value = (await http.get("/admin/users", { params: { q: q.value } })).data;
}

async function grant(row) {
  try {
    await ElMessageBox.confirm(`为「${row.nickname}」开通或续费一年会员？`, "开通会员", { type: "warning" });
    await http.post(`/admin/users/${row.id}/member`, { action: "grant" });
    ElMessage.success("已开通/续费会员");
    await load();
  } catch (e) {
    if (e !== "cancel") ElMessage.error(e.message || "已取消");
  }
}

async function revoke(row) {
  try {
    await ElMessageBox.confirm(`取消「${row.nickname}」的会员资格？`, "取消会员", { type: "warning" });
    await http.post(`/admin/users/${row.id}/member`, { action: "revoke" });
    ElMessage.success("已取消会员");
    await load();
  } catch (e) {
    if (e !== "cancel") ElMessage.error(e.message || "已取消");
  }
}

function openPoints(row) {
  pointsRow.value = row;
  pointsForm.value = { delta: 10, reason: "" };
  showPoints.value = true;
}

async function savePoints() {
  saving.value = true;
  try {
    await http.post(`/admin/users/${pointsRow.value.id}/points`, pointsForm.value);
    showPoints.value = false;
    ElMessage.success("积分已调整");
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function close(row) {
  try {
    await ElMessageBox.confirm(`注销「${row.nickname}」后将取消未出行报名，同一手机可再注册。`, "注销用户", { type: "warning" });
    await http.post(`/admin/users/${row.id}/close`);
    ElMessage.success("已注销");
    await load();
  } catch (e) {
    if (e !== "cancel") ElMessage.error(e.message || "已取消");
  }
}
</script>
