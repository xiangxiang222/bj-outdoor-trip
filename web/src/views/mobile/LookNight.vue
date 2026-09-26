<template>
  <div class="cell-group look-choice">
    <button class="cell" type="button" @click="pick('system')">
      <span><strong>{{ copy.systemNight }}</strong><small>{{ copy.systemNightSub }}</small></span>
      <i v-if="look.night === 'system'">✓</i>
    </button>
    <button class="cell" type="button" @click="pick('day')">
      <span>{{ copy.day }}</span><i v-if="look.night === 'day'">✓</i>
    </button>
    <button class="cell" type="button" @click="pick('dark')">
      <span>{{ copy.dark }}</span><i v-if="look.night === 'dark'">✓</i>
    </button>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive } from "vue";
import { setChrome } from "@/utils/pageChrome";
import { readLook, writeLook, t } from "@/utils/appearance";

const look = reactive(readLook());
const copy = computed(() => t(look));
onMounted(() => setChrome(copy.value.nightTitle, ""));

function pick(night) {
  Object.assign(look, writeLook({ night }));
}
</script>
