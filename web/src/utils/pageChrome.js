import { ref } from "vue";

export const chromeTitle = ref("");
export const chromeSubtitle = ref("");

export function setChrome(title = "", subtitle = "") {
  chromeTitle.value = title;
  chromeSubtitle.value = subtitle;
}

export function clearChrome() {
  chromeTitle.value = "";
  chromeSubtitle.value = "";
}
