import { defineStore } from "pinia";
import http from "./http";

export const useUserStore = defineStore("user", {
  state: () => ({
    token: localStorage.getItem("bj_token") || "",
    profile: JSON.parse(localStorage.getItem("bj_profile") || "null"),
    meta: null,
  }),
  getters: {
    logged: (s) => !!s.token,
    isMember: (s) => !!s.profile?.isMember,
  },
  actions: {
    setAuth(token, user) {
      this.token = token;
      this.profile = user;
      localStorage.setItem("bj_token", token);
      localStorage.setItem("bj_profile", JSON.stringify(user));
    },
    logout() {
      this.token = "";
      this.profile = null;
      localStorage.removeItem("bj_token");
      localStorage.removeItem("bj_profile");
    },
    async loadMeta() {
      const r = await http.get("/meta");
      this.meta = r.data;
    },
    async refresh() {
      if (!this.token) return;
      const r = await http.get("/me");
      this.profile = r.data;
      localStorage.setItem("bj_profile", JSON.stringify(r.data));
    },
  },
});
