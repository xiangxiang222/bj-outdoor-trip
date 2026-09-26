<template>
  <div class="look-font" :style="{ fontFamily: fontFamily }">
    <div class="cell-label">{{ copy.preview }}</div>
    <div class="look-preview">
      <div class="look-sample">
        <div class="look-pt">{{ copy.previewTitle }}</div>
        <div class="look-pb">{{ copy.previewBody }}</div>
        <div class="look-pn">{{ copy.previewNote }}</div>
      </div>
    </div>
    <div class="cell-label">{{ copy.fontPick }}</div>
    <div class="look-fonts">
      <button v-for="item in fonts" :key="item.id" type="button" class="look-font-card" :class="{ on: look.font === item.id }" :style="{ fontFamily: item.family }" @click="pickFont(item.id)">
        <strong>{{ item.name }}</strong>
        <span>{{ look.font === item.id ? copy.using : copy.use }}</span>
      </button>
    </div>
    <div class="cell-label">{{ copy.size }}</div>
    <div class="look-size">
      <div class="look-scale"><span>A</span><span>{{ copy.standard }}</span><span class="big">A</span></div>
      <input type="range" min="0" max="4" step="1" :value="look.size" @input="setSize" />
      <div class="look-hint">{{ copy.sizeHint }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive } from "vue";
import { setChrome } from "@/utils/pageChrome";
import { FONTS, readLook, writeLook, t } from "@/utils/appearance";

const look = reactive(readLook());
const copy = computed(() => t(look));
const fontFamily = computed(() => FONTS[look.font]);
const fonts = computed(() => [
  { id: "system", name: copy.value.system, family: FONTS.system },
  { id: "song", name: copy.value.song, family: FONTS.song },
  { id: "kai", name: copy.value.kai, family: FONTS.kai },
]);

onMounted(() => setChrome(copy.value.fontTitle, ""));

function pickFont(id) {
  Object.assign(look, writeLook({ font: id }));
}
function setSize(e) {
  Object.assign(look, writeLook({ size: Number(e.target.value) }));
}
</script>
