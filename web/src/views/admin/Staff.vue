<template>
  <div>
    <div class="row">
      <h2>管理员</h2>
      <div>
        <el-button @click="openPwd">修改我的密码</el-button>
        <el-button type="success" @click="openCreate">新增账号</el-button>
      </div>
    </div>
    <p class="muted">管理员可管理全部后台账号；运营可处理线路、拼团、报名和会员，但不能增删其他管理员。</p>
    <el-table :data="list" stripe>
      <el-table-column prop="username" label="账号" width="140" />
      <el-table-column prop="name" label="姓名" width="140" />
      <el-table-column label="角色" width="100">
        <template #default="{ row }">{{ row.role === "operator" ? "运营" : "管理员" }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">{{ row.status === "off" ? "停用" : "启用" }}</template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" />
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" @click="openReset(row)">重置密码</el-button>
          <el-button size="small" :disabled="row.id === me.id" @click="toggle(row)">
            {{ row.status === "off" ? "启用" : "停用" }}
          </el-button>
          <el-button size="small" type="danger" :disabled="row.id === me.id" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showForm" :title="form.id ? '编辑账号' : '新增账号'" width="460px">
      <el-form label-width="90px">
        <el-form-item label="账号">
          <el-input v-model="form.username" :disabled="!!form.id" placeholder="字母开头，3–32 位" />
        </el-form-item>
        <el-form-item label="姓名"><el-input v-model="form.name" maxlength="20" /></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role">
            <el-option label="管理员" value="admin" />
            <el-option label="运营" value="operator" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!form.id" label="密码">
          <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showForm = false">取消</el-button>
        <el-button type="success" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showReset" title="重置密码" width="420px">
      <p class="muted">将重置「{{ resetRow?.name }}」的登录密码。</p>
      <el-input v-model="resetPassword" type="password" show-password placeholder="新密码，至少 6 位" />
      <template #footer>
        <el-button @click="showReset = false">取消</el-button>
        <el-button type="success" :loading="saving" @click="saveReset">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showPwd" title="修改我的密码" width="420px">
      <el-form label-width="90px">
        <el-form-item label="原密码"><el-input v-model="pwd.oldPassword" type="password" show-password /></el-form-item>
        <el-form-item label="新密码"><el-input v-model="pwd.newPassword" type="password" show-password /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPwd = false">取消</el-button>
        <el-button type="success" :loading="saving" @click="savePwd">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import http from "@/api/http";

const list = ref([]);
const me = ref({ id: 0, role: "admin" });
const showForm = ref(false);
const showReset = ref(false);
const showPwd = ref(false);
const saving = ref(false);
const resetRow = ref(null);
const resetPassword = ref("");
const form = ref({ id: 0, username: "", name: "", role: "operator", password: "" });
const pwd = ref({ oldPassword: "", newPassword: "" });

onMounted(load);

async function load() {
  try {
    me.value = (await http.get("/admin/me")).data;
    list.value = (await http.get("/admin/staff")).data;
  } catch (e) {
    ElMessage.error(e.message || "无权查看管理员列表");
  }
}

function openCreate() {
  form.value = { id: 0, username: "", name: "", role: "operator", password: "" };
  showForm.value = true;
}
function openEdit(row) {
  form.value = { id: row.id, username: row.username, name: row.name, role: row.role, password: "" };
  showForm.value = true;
}
function openReset(row) {
  resetRow.value = row;
  resetPassword.value = "";
  showReset.value = true;
}
function openPwd() {
  pwd.value = { oldPassword: "", newPassword: "" };
  showPwd.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (form.value.id) {
      await http.put("/admin/staff/" + form.value.id, { name: form.value.name, role: form.value.role });
    } else {
      await http.post("/admin/staff", form.value);
    }
    showForm.value = false;
    ElMessage.success("已保存");
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function saveReset() {
  saving.value = true;
  try {
    await http.put("/admin/staff/" + resetRow.value.id, { password: resetPassword.value });
    showReset.value = false;
    ElMessage.success("密码已重置");
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function savePwd() {
  saving.value = true;
  try {
    await http.put("/admin/me/password", pwd.value);
    showPwd.value = false;
    ElMessage.success("密码已修改，请牢记新密码");
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function toggle(row) {
  const next = row.status === "off" ? "on" : "off";
  try {
    if (next === "off") {
      await ElMessageBox.confirm(`停用「${row.name}」后将无法登录后台。`, "停用账号", { type: "warning" });
    }
    await http.put("/admin/staff/" + row.id, { status: next });
    ElMessage.success(next === "off" ? "已停用" : "已启用");
    await load();
  } catch (e) {
    if (e !== "cancel") ElMessage.error(e.message || "操作已取消");
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`删除「${row.name}」后不可恢复。`, "删除账号", { type: "warning" });
    await http.delete("/admin/staff/" + row.id);
    ElMessage.success("已删除");
    await load();
  } catch (e) {
    if (e !== "cancel") ElMessage.error(e.message || "操作已取消");
  }
}
</script>
