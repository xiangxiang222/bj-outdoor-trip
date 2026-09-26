<template>
  <el-config-provider :locale="epLocale">
    <router-view />
  </el-config-provider>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import zhTw from "element-plus/es/locale/lang/zh-tw";
import en from "element-plus/es/locale/lang/en";
import { readLook } from "@/utils/appearance";

const locales = { zh: zhCn, tw: zhTw, en };
const lang = ref(readLook().lang);
const epLocale = computed(() => locales[lang.value] || zhCn);

function sync() {
  lang.value = readLook().lang;
}

onMounted(() => window.addEventListener("bj-look", sync));
onBeforeUnmount(() => window.removeEventListener("bj-look", sync));
</script>
