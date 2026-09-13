import axios from "axios";

const http = axios.create({ baseURL: "/api", timeout: 20000 });

http.interceptors.request.use((config) => {
  const admin = localStorage.getItem("bj_admin_token");
  const guide = localStorage.getItem("bj_guide_token");
  const user = localStorage.getItem("bj_token");
  if (config.url.startsWith("/admin") && !config.url.includes("/admin/login")) {
    if (admin) config.headers.Authorization = `Bearer ${admin}`;
  } else if (config.url.startsWith("/guide") && !config.url.includes("/guide/login")) {
    if (guide) config.headers.Authorization = `Bearer ${guide}`;
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
  if (out.photo) out.photo = toPath(out.photo);
  if (out.url && typeof out.url === "string") out.url = toPath(out.url);
  if (out.embedUrl && typeof out.embedUrl === "string") out.embedUrl = toPath(out.embedUrl);
  if (Array.isArray(out.gallery)) {
    out.gallery = out.gallery.map((g) => (typeof g === "string" ? toPath(g) : localizeMedia(g)));
  }
  if (Array.isArray(out.photos)) out.photos = out.photos.map(toPath);
  Object.keys(out).forEach((key) => {
    if (key === "cover" || key === "avatar" || key === "gallery" || key === "photo" || key === "photos" || key === "url") return;
    if (out[key] && typeof out[key] === "object") out[key] = localizeMedia(out[key]);
  });
  return out;
}

http.interceptors.response.use(
  (r) => localizeMedia(r.data),
  (err) => {
    const data = err.response?.data || {};
    const e = new Error(data.message || err.message || "网络错误");
    e.code = data.code || "";
    e.status = err.response?.status;
    return Promise.reject(e);
  }
);

export default http;
