<template>
  <div v-if="u">
    <div class="card">
      <div class="pad guide-row">
        <div class="guide-face" style="width:64px;height:64px;font-size:22px">
          <img v-if="u.avatar" :src="u.avatar" :alt="u.nickname" />
          <span v-else>{{ (u.nickname || "友").slice(0, 1) }}</span>
        </div>
        <div>
          <div class="row">
            <strong style="font-size:18px">{{ u.nickname }}</strong>
            <span class="tag" v-if="u.isLeader">领队</span>
            <span class="tag" v-if="u.lifeStage">{{ u.lifeStage }}</span>
          </div>
          <p class="muted" style="margin:6px 0 0">
            {{ genderText(u.gender) }}<template v-if="u.hometown"> · {{ u.hometown }}</template>
            · 已出行 {{ u.tripCount }} 次
          </p>
        </div>
      </div>
    </div>

    <div class="h2">个人相册</div>
    <div class="moments-grid" v-if="u.album?.length || isSelf">
      <div v-for="(p, i) in u.album || []" :key="p.id" class="moments-cell">
        <img :src="p.url" alt="" @click="preview(i)" />
        <button v-if="isSelf" class="moments-del" type="button" aria-label="删除" @click.stop="removePhoto(p)">×</button>
      </div>
      <label v-if="isSelf && remain > 0" class="moments-add" :class="{ busy: uploading }">
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden :disabled="uploading" @change="onPhotos" />
        <i />
      </label>
    </div>
    <p class="muted" v-else>还没有相册。</p>
    <p v-if="isSelf" class="muted moments-hint">一次最多选 9 张，相册最多 24 张。点图放大，点角标删除。</p>

    <Teleport to="body">
      <div v-if="previewIndex != null" class="lightbox" @click.self="previewIndex = null">
        <img :src="(u.album || [])[previewIndex]?.url" @click.stop="next" />
        <div class="lb-nav">
          <button class="lb-btn" type="button" @click.stop="prev">上一张</button>
          <button class="lb-btn" type="button" @click.stop="previewIndex = null">关闭</button>
          <button class="lb-btn" type="button" @click.stop="next">下一张</button>
        </div>
        <div class="lb-hint">{{ previewIndex + 1 }} / {{ (u.album || []).length }} · 点图下一张</div>
      </div>
    </Teleport>

    <div class="h2">拟出行</div>
    <div class="card" v-for="t in u.trips?.upcoming || []" :key="'u'+t.id" @click="$router.push('/m/schedule/' + t.scheduleId)">
      <div class="pad">
        <div class="row"><strong>{{ t.title }}</strong><span class="tag">{{ t.startDate }}</span></div>
        <p class="muted" style="margin:6px 0 0">{{ t.region }}</p>
      </div>
    </div>
    <p class="muted" v-if="!u.trips?.upcoming?.length">暂无即将出发的行程。</p>

    <div class="h2">已参与</div>
    <div class="card" v-for="t in u.trips?.past || []" :key="'p'+t.id" @click="$router.push('/m/schedule/' + t.scheduleId)">
      <div class="pad">
        <div class="row"><strong>{{ t.title }}</strong><span class="tag">{{ t.startDate }}</span></div>
      </div>
    </div>
    <p class="muted" v-if="!u.trips?.past?.length">还没有过往行程。</p>

    <div class="h2">关注的</div>
    <div class="card" v-for="t in u.trips?.following || []" :key="'f'+t.id" @click="$router.push('/m/route/' + t.routeId)">
      <div class="pad"><strong>{{ t.title }}</strong><p class="muted" style="margin:6px 0 0">{{ t.region }}</p></div>
    </div>
    <p class="muted" v-if="!u.trips?.following?.length">还没有关注线路。</p>
    <p class="muted">公开资料不含手机号与精确年龄，仅展示年龄段。</p>
    <p v-if="msg" class="muted">{{ msg }}</p>
  </div>
  <p v-else-if="err" class="muted">{{ err }}</p>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { genderText } from "@/utils/labels";

const ALBUM_MAX = 24;
const PICK_MAX = 9;

const route = useRoute();
const store = useUserStore();
const u = ref(null);
const err = ref("");
const msg = ref("");
const uploading = ref(false);
const previewIndex = ref(null);
const isSelf = computed(() => store.profile && u.value && Number(store.profile.id) === Number(u.value.id));
const remain = computed(() => ALBUM_MAX - (u.value?.album?.length || 0));

async function load() {
  try {
    if (store.token && !store.profile?.id) {
      try { await store.fetchMe(); } catch { /* 仍按公开主页展示 */ }
    }
    u.value = (await http.get("/users/" + route.params.id)).data;
    err.value = "";
  } catch (e) {
    u.value = null;
    err.value = e.message || "用户不存在";
  }
}

function preview(i) {
  previewIndex.value = i;
}
function prev() {
  const n = u.value?.album?.length || 0;
  if (!n) return;
  previewIndex.value = (previewIndex.value + n - 1) % n;
}
function next() {
  const n = u.value?.album?.length || 0;
  if (!n) return;
  previewIndex.value = (previewIndex.value + 1) % n;
}
function onKey(e) {
  if (previewIndex.value == null) return;
  if (e.key === "Escape") previewIndex.value = null;
  if (e.key === "ArrowLeft") prev();
  if (e.key === "ArrowRight") next();
}

async function onPhotos(e) {
  const files = [...(e.target.files || [])].slice(0, Math.min(PICK_MAX, remain.value));
  e.target.value = "";
  if (!files.length) return;
  uploading.value = true;
  msg.value = "";
  let ok = 0;
  try {
    for (const file of files) {
      const body = new FormData();
      body.append("file", file);
      const up = await http.post("/upload", body);
      await http.post("/me/photos", { url: up.data.url });
      ok += 1;
    }
    msg.value = ok > 1 ? `已加入 ${ok} 张` : "已加入相册";
    await load();
  } catch (ex) {
    msg.value = ex.message || "上传失败";
    if (ok) await load();
  } finally {
    uploading.value = false;
  }
}

async function removePhoto(p) {
  if (!window.confirm("删除这张照片？")) return;
  try {
    await http.delete("/me/photos/" + p.id);
    if (previewIndex.value != null) previewIndex.value = null;
    msg.value = "已删除";
    await load();
  } catch (ex) {
    msg.value = ex.message || "删除失败";
  }
}

onMounted(() => {
  load();
  window.addEventListener("keydown", onKey);
});
onUnmounted(() => window.removeEventListener("keydown", onKey));
watch(() => route.params.id, load);
</script>
