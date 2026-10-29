const { request, setAuth } = require("../../utils/request");
const { openCampusPick } = require("../../utils/campus");
const { absMedia } = require("../../utils/media");
const { isDark } = require("../../utils/appearance");
const app = getApp();

function uploadFile(filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: app.globalData.baseUrl + "/api/upload", filePath, name: "file",
      header: { Authorization: app.globalData.token ? "Bearer " + app.globalData.token : "" },
      success(res) {
        try {
          const data = JSON.parse(res.data || "{}");
          if (res.statusCode >= 200 && res.statusCode < 300 && data.ok && data.data && data.data.url) resolve(data.data.url);
          else reject(new Error(data.message || "证件上传失败，请重试"));
        } catch { reject(new Error("证件上传失败，请重试")); }
      },
      fail() { reject(new Error("证件上传失败，请重试")); },
    });
  });
}

function draftKey(data) {
  return JSON.stringify([data.campusKind || "student", data.school || "", data.college || "", data.major || "", data.studentNo || "", data.studentCardUrl || ""]);
}

Page({
  data: {
    campusKind: "student", kindIndex: 0, kindLabels: ["在读师生", "校友"], kindLabel: "在读师生",
    school: "", college: "", major: "", studentNo: "", studentCardUrl: "", cardPreviewUrl: "",
    placeLine: "", certified: false, pending: false, rejected: false,
    loading: false, uploading: false, refreshing: false, refreshError: "", dark: false, redirect: "", errors: {},
  },
  onLoad(q) { this.setData({ redirect: (q && q.redirect) || "" }); },
  onShow() {
    this._unloaded = false;
    this.setData({ dark: isDark() });
    const owner = app.globalData.token || "guest";
    if (this._draftOwner !== owner) { this._draftOwner = owner; this._draftInitialized = false; }
    this.syncUser(app.globalData.user || {});
    return this.refreshStatus();
  },
  onUnload() { this._unloaded = true; },
  syncUser(u) {
    const certified = !!(u.isStudent || u.isAlumni);
    const pending = !certified && u.studentStatus === "pending";
    const hydrate = certified || pending || !this._draftInitialized || draftKey(this.data) === this._draftBaseline;
    const campusKind = hydrate ? (u.campusKind === "alumni" || u.isAlumni ? "alumni" : "student") : this.data.campusKind;
    const school = hydrate ? u.school || "" : this.data.school;
    const college = hydrate ? u.college || "" : this.data.college;
    const major = hydrate ? u.major || "" : this.data.major;
    const studentCardUrl = hydrate ? u.studentCardUrl || "" : this.data.studentCardUrl;
    this._draftInitialized = true;
    this.setData({
      school, college, major, campusKind, studentCardUrl,
      studentNo: hydrate ? u.studentNo || "" : this.data.studentNo,
      cardPreviewUrl: absMedia(studentCardUrl, app.globalData.baseUrl),
      kindIndex: campusKind === "alumni" ? 1 : 0,
      kindLabel: campusKind === "alumni" ? "毕业校友" : "在读师生",
      placeLine: [school, college, major].filter(Boolean).join(" · "),
      certified, pending, rejected: !certified && !pending && u.studentStatus === "rejected",
    });
    if (hydrate) this._draftBaseline = draftKey(this.data);
  },
  refreshStatus() {
    const token = app.globalData.token;
    if (!token || this._refreshPromise) return this._refreshPromise;
    const version = this._profileVersion || 0;
    this.setData({ refreshing: true, refreshError: "" });
    this._refreshPromise = request("/me")
      .then((res) => {
        if (this._unloaded || token !== app.globalData.token || version !== (this._profileVersion || 0)) return;
        setAuth(token, res.data);
        this.syncUser(res.data || {});
      })
      .catch(() => {
        if (!this._unloaded && token === app.globalData.token && version === (this._profileVersion || 0)) this.setData({ refreshError: "认证状态暂未更新，请重试" });
      })
      .finally(() => {
        this._refreshPromise = null;
        if (!this._unloaded) this.setData({ refreshing: false });
      });
    return this._refreshPromise;
  },
  locked() { return this.data.certified || this.data.pending || this.data.loading || this.data.uploading; },
  setKind(e) {
    if (this.locked()) return;
    const kind = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.kind;
    const alumni = kind ? kind === "alumni" : Number(e.detail.value) === 1;
    this.setData({ campusKind: alumni ? "alumni" : "student", kindIndex: alumni ? 1 : 0, kindLabel: alumni ? "毕业校友" : "在读师生", errors: {} });
  },
  pickSchool() {
    if (this.locked()) return;
    openCampusPick({ kind: "school", title: "选择学校", selected: this.data.school,
      onPick: (names) => {
        const school = names[0] || "";
        this.setData({ school, ...(school !== this.data.school ? { college: "", major: "" } : {}), "errors.school": "", "errors.college": "", "errors.major": "", "errors.submit": "" });
      },
    });
  },
  pickCollege() {
    if (this.locked()) return;
    if (!this.data.school) { this.setData({ "errors.college": "请先选择学校" }); return; }
    openCampusPick({ kind: "college", school: this.data.school, title: "选择学院", selected: this.data.college,
      onPick: (names) => {
        const college = names[0] || "";
        this.setData({ college, ...(college !== this.data.college ? { major: "" } : {}), "errors.college": "", "errors.major": "", "errors.submit": "" });
      },
    });
  },
  pickMajor() {
    if (this.locked()) return;
    if (!this.data.college) { this.setData({ "errors.major": "请先选择学院" }); return; }
    openCampusPick({ kind: "major", school: this.data.school, college: this.data.college, title: "选择专业", selected: this.data.major,
      onPick: (names) => this.setData({ major: names[0] || "", "errors.major": "", "errors.submit": "" }),
    });
  },
  onNo(e) {
    if (!this.locked()) this.setData({ studentNo: e.detail.value, "errors.studentNo": "", "errors.submit": "" });
  },
  login() { wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/student/student" + (this.data.redirect ? "?redirect=" + encodeURIComponent(this.data.redirect) : "")) }); },
  pickCard() {
    if (this.locked()) return;
    if (!app.globalData.token) { this.login(); return; }
    wx.chooseMedia({ count: 1, mediaType: ["image"],
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || this.locked() || this._unloaded) return;
        if (Number(file.size) > 5 * 1024 * 1024) { this.setData({ "errors.card": "证件照片请小于 5MB" }); return; }
        const ext = String(file.tempFilePath || "").split("?")[0].match(/\.([a-z0-9]+)$/i);
        if (ext && !/^(jpe?g|png|webp)$/i.test(ext[1])) { this.setData({ "errors.card": "请上传 JPG、PNG 或 WebP 格式的证件照片" }); return; }
        const token = app.globalData.token;
        this.setData({ uploading: true, "errors.card": "", "errors.submit": "" });
        try {
          const url = await uploadFile(file.tempFilePath);
          if (!this._unloaded && token === app.globalData.token) this.setData({ studentCardUrl: url, cardPreviewUrl: absMedia(url, app.globalData.baseUrl) });
        } catch (e) {
          if (!this._unloaded && token === app.globalData.token) this.setData({ "errors.card": e.message || "证件上传失败，请重试" });
        } finally { if (!this._unloaded) this.setData({ uploading: false }); }
      },
    });
  },
  async submit() {
    if (this.locked()) return;
    if (!app.globalData.token) { this.login(); return; }
    const errors = {};
    for (const [key, label] of [["school", "学校全称"], ["college", "学院"], ["major", "专业"]]) {
      const value = String(this.data[key] || "").trim();
      if (value && value.length < 2) errors[key] = "请选择或填写" + label;
    }
    if (this.data.college && !this.data.school) errors.college = "选择学院前，请先选择学校";
    if (this.data.major && !this.data.college) errors.major = "选择专业前，请先选择学院";
    if (this.data.campusKind === "student" && this.data.studentNo.trim().length < 4) errors.studentNo = "请填写至少 4 位学号或工号";
    if (!this.data.studentCardUrl) errors.card = this.data.campusKind === "alumni" ? "请上传毕业证或校友证照片" : "请上传学生证或教职工证照片";
    this.setData({ errors });
    if (Object.keys(errors).length) {
      const section = errors.school || errors.college || errors.major || errors.studentNo ? "#campus-fields" : "#campus-proof";
      wx.pageScrollTo({ selector: section, duration: 200 });
      return;
    }
    const token = app.globalData.token;
    this._profileVersion = (this._profileVersion || 0) + 1;
    this.setData({ loading: true });
    try {
      const res = await request("/me/student", "POST", {
        school: this.data.school.trim(), college: this.data.college.trim(), major: this.data.major.trim(),
        studentNo: this.data.campusKind === "alumni" ? "" : this.data.studentNo.trim(),
        studentCardUrl: this.data.studentCardUrl, campusKind: this.data.campusKind,
      });
      if (this._unloaded || token !== app.globalData.token) return;
      setAuth(token, res.data);
      this.syncUser(res.data);
      wx.pageScrollTo({ selector: "#cert-result", duration: 200 });
    } catch (e) {
      if (!this._unloaded && token === app.globalData.token) this.setData({ "errors.submit": e.message || "提交失败，请稍后再试" });
    } finally { if (!this._unloaded) this.setData({ loading: false }); }
  },
  goDiscover() { app.globalData.homeCampus = true; wx.switchTab({ url: "/pages/index/index" }); },
  goBack() {
    const url = this.data.redirect;
    if (url) wx.navigateTo({ url });
    else wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/mine/mine" }) });
  },
});
