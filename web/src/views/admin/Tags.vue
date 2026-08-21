<template>
  <div>
    <div class="row">
      <h2>玩法标签</h2>
      <el-button type="success" @click="open">新增标签</el-button>
    </div>
    <p class="muted">首页「想怎么玩」展示这些标签。发团时可勾选，审核通过后出现在行程标题后。</p>
    <el-table :data="list" stripe>
      <el-table-column label="颜色" width="80">
        <template #default="{ row }">
          <span class="dot" :style="{ background: row.color }" />
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" />
      <el-table-column label="图" width="80">
        <template #default="{ row }">
          <el-image v-if="row.cover" :src="row.cover" style="width:40px;height:40px;border-radius:8px" fit="cover" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button size="small" @click="edit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="off(row)">下架</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="show" :title="form.id ? '编辑标签' : '新增标签'" width="480px">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="颜色"><el-input v-model="form.color" placeholder="#2d6a4f" /></el-form-item>
        <el-form-item label="配图">
          <el-upload :show-file-list="false" accept="image/*" :http-request="uploadCover">
            <el-image v-if="form.cover" :src="form.cover" style="width:80px;height:80px" fit="cover" />
            <el-button v-else>上传</el-button>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="show = false">取消</el-button>
        <el-button type="success" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import http from "@/api/http";

const list = ref([]);
const show = ref(false);
const form = ref({});

async function load() {
  list.value = (await http.get("/admin/play-tags")).data;
}
onMounted(load);

function open() {
  form.value = { name: "", color: "", cover: "" };
  show.value = true;
}
function edit(row) {
  form.value = { ...row };
  show.value = true;
}
async function uploadCover(opt) {
  const data = new FormData();
  data.append("file", opt.file);
  try {
    const res = await http.post("/admin/upload", data);
    form.value.cover = res.data.url;
    opt.onSuccess?.({});
  } catch (e) {
    ElMessage.error(e.message);
    opt.onError?.(e);
  }
}
async function save() {
  if (form.value.id) await http.put("/admin/play-tags/" + form.value.id, form.value);
  else await http.post("/admin/play-tags", form.value);
  show.value = false;
  ElMessage.success("已保存");
  load();
}
async function off(row) {
  await http.delete("/admin/play-tags/" + row.id);
  ElMessage.success("已下架");
  load();
}
</script>

<style scoped>
.dot { display: inline-block; width: 18px; height: 18px; border-radius: 50%; }
</style>
