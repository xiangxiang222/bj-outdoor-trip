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
    <div class="album-grid" v-if="u.album?.length">
      <img v-for="p in u.album" :key="p.id" :src="p.url" alt="" />
    </div>
    <p class="muted" v-else>还没有相册。</p>
    <div v-if="isSelf" class="card"><div class="pad">
      <input type="file" accept="image/*" @change="onPhoto" />
      <p class="muted">最多 24 张，用于个人主页展示。</p>
    </div></div>

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
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { genderText } from "@/utils/labels";

const route = useRoute();
const store = useUserStore();
const u = ref(null);
const err = ref("");
const msg = ref("");
const isSelf = computed(() => store.profile && u.value && Number(store.profile.id) === Number(u.value.id));

async function load() {
  try {
    u.value = (await http.get("/users/" + route.params.id)).data;
  } catch (e) {
    err.value = e.message || "用户不存在";
  }
}

onMounted(load);

async function onPhoto(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  const body = new FormData();
  body.append("file", file);
  try {
    const up = await http.post("/upload", body);
    await http.post("/me/photos", { url: up.data.url });
    msg.value = "已加入相册";
    await load();
  } catch (ex) {
    msg.value = ex.message || "上传失败";
  }
}
</script>
