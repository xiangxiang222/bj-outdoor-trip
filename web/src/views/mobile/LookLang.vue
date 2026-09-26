<template>
  <div>
    <div class="cell-label">{{ copy.pickLang }}</div>
    <div class="cell-group look-choice">
      <button class="cell" type="button" @click="pick('zh')">
        <span>{{ copy.zh }}</span><i v-if="look.lang === 'zh'">✓</i>
      </button>
      <button class="cell" type="button" @click="pick('en')">
        <span>English</span><i v-if="look.lang === 'en'">✓</i>
      </button>
      <button class="cell" type="button" @click="pick('tw')">
        <span>{{ copy.tw }}</span><i v-if="look.lang === 'tw'">✓</i>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive } from "vue";
import { setChrome } from "@/utils/pageChrome";
import { readLook, writeLook, t } from "@/utils/appearance";

const look = reactive(readLook());
const copy = computed(() => t(look));
onMounted(() => setChrome(copy.value.langTitle, ""));

function pick(lang) {
  Object.assign(look, writeLook({ lang }));
  setChrome(copy.value.langTitle, "");
}
</script>
