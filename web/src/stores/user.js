import { defineStore } from "pinia";
import { ref } from "vue";
import http from "../api/http";

export const useUserStore = defineStore("user", () => {
  const token = ref(localStorage.getItem("bj_token") || "");
  const profile = ref(JSON.parse(localStorage.getItem("bj_user") || "null"));
  const meta = ref(null);

  function setAuth(t, u) {
    token.value = t;
    profile.value = u;
    localStorage.setItem("bj_token", t);
    localStorage.setItem("bj_user", JSON.stringify(u));
  }

  function logout() {
    token.value = "";
    profile.value = null;
    localStorage.removeItem("bj_token");
    localStorage.removeItem("bj_user");
  }

  async function fetchMe() {
    if (!token.value) return;
    const res = await http.get("/me");
    profile.value = res.data;
    localStorage.setItem("bj_user", JSON.stringify(res.data));
  }

  async function fetchMeta() {
    const res = await http.get("/meta");
    meta.value = res.data;
  }

  return { token, profile, meta, setAuth, logout, fetchMe, fetchMeta };
});
