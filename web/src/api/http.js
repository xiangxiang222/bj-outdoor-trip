import axios from "axios";

const http = axios.create({ baseURL: "/api", timeout: 20000 });

http.interceptors.request.use((config) => {
  const admin = localStorage.getItem("bj_admin_token");
  const user = localStorage.getItem("bj_token");
  const token = config.url.startsWith("/admin") && !config.url.includes("/admin/login") ? admin : user;
  if (config.url.startsWith("/admin") && !config.url.includes("/admin/login")) {
    if (admin) config.headers.Authorization = `Bearer ${admin}`;
  } else if (user) {
    config.headers.Authorization = `Bearer ${user}`;
  }
  return config;
});

function localizeMedia(value) {
  if (Array.isArray(value)) return value.map(localizeMedia);
  if (!value || typeof value !== "object") return value;
  const out = { ...value };
  const toPath = (url) => {
    if (typeof url !== "string") return url;
    const hit = url.match(/(\/static\/.+)$/);
    return hit ? hit[1] : url.replace(/^https?:\/\/(127\.0\.0\.1|localhost):\d+/i, "");
  };
  if (out.cover) out.cover = toPath(out.cover);
  if (out.avatar) out.avatar = toPath(out.avatar);
  if (Array.isArray(out.gallery)) out.gallery = out.gallery.map(toPath);
  Object.keys(out).forEach((key) => {
    if (key === "cover" || key === "avatar" || key === "gallery") return;
    if (out[key] && typeof out[key] === "object") out[key] = localizeMedia(out[key]);
  });
  return out;
}

http.interceptors.response.use(
  (r) => localizeMedia(r.data),
  (err) => {
    const msg = err.response?.data?.message || err.message || "网络错误";
    return Promise.reject(new Error(msg));
  }
);

export default http;
