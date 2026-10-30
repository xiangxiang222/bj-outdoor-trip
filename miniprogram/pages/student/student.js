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
    placeLine: "", certified: false, pending: false, rejected: false, studentRevision: 0,
    managementOpen: false, managing: false, editing: false, converting: false, actionMessage: "",
    loading: false, uploading: false, refreshing: false, refreshError: "", dark: false, redirect: "", errors: {},
  },
  onLoad(q) { this.setData({ redirect: (q && q.redirect) || "" }); },
  onShow() {
    this._unloaded = false;
    this.setData({ dark: isDark() });
    const owner = app.globalData.token || "guest";
    if (this._draftOwner !== owner) {
      this._draftOwner = owner; this._draftInitialized = false; this._profileVersion = (this._profileVersion || 0) + 1;
      this.setData({ editing: false, converting: false, managementOpen: false, managing: false, loading: false, uploading: false, errors: {}, actionMessage: "" });
    }
    this.syncUser(app.globalData.user || {});
    return this.refreshStatus();
  },
  onUnload() { this._unloaded = true; },
  syncUser(u) {
    const certified = !!(u.isStudent || u.isAlumni);
    const pending = !certified && u.studentStatus === "pending";
    const revision = Number(u.studentRevision) || 0;
    const changedWhileEditing = this.data.editing && (revision !== this.data.studentRevision || !certified);
    this._certProfile = { ...u };
    if (changedWhileEditing) this.setData({ editing: false, converting: false, managementOpen: false, actionMessage: "认证状态已更新，请查看最新记录后再操作" });
    const hydrate = !this.data.editing && (certified || pending || !this._draftInitialized || draftKey(this.data) === this._draftBaseline || changedWhileEditing);
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
      certified, pending, rejected: !certified && !pending && u.studentStatus === "rejected", studentRevision: revision,
    });
    if (hydrate) this._draftBaseline = draftKey(this.data);
  },
  refreshStatus(force) {
    const token = app.globalData.token;
    if (!token) return;
    if (force !== true && this._refreshPromise && this._refreshToken === token) return this._refreshPromise;
    this._refreshToken = token;
    const sequence = this._refreshSequence = (this._refreshSequence || 0) + 1;
    const version = this._profileVersion || 0;
    this.setData({ refreshing: true, refreshError: "" });
    this._refreshPromise = request("/me")
      .then((res) => {
        if (this._unloaded || token !== app.globalData.token || version !== (this._profileVersion || 0) || sequence !== this._refreshSequence) return;
        setAuth(token, res.data);
        this.syncUser(res.data || {});
      })
      .catch(() => {
        if (!this._unloaded && token === app.globalData.token && version === (this._profileVersion || 0) && sequence === this._refreshSequence) this.setData({ refreshError: "认证状态暂未更新，请重试" });
      })
      .finally(() => {
        if (sequence !== this._refreshSequence) return;
        this._refreshPromise = null;
        if (!this._unloaded) this.setData({ refreshing: false });
      });
    return this._refreshPromise;
  },
  locked() { return (this.data.certified && !this.data.editing) || this.data.pending || this.data.loading || this.data.uploading || this.data.managing; },
  toggleManagement() {
    if (this.data.loading || this.data.managing || this.data.editing) return;
    this.setData({ managementOpen: !this.data.managementOpen, "errors.manage": "" });
  },
  startEdit(e) {
    if (!this.data.certified || this.data.editing || this.data.loading || this.data.uploading || this.data.managing) return;
    const convert = !!(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.kind === "alumni");
    if (convert && this._certProfile && this._certProfile.isAlumni) return;
    this.setData({ editing: true, converting: convert, managementOpen: false, errors: {}, actionMessage: "", ...(convert ? { campusKind: "alumni", kindIndex: 1, kindLabel: "毕业校友", studentNo: "", studentCardUrl: "", cardPreviewUrl: "" } : {}) });
    wx.pageScrollTo({ selector: "#cert-edit-notice", duration: 200 });
  },
  cancelEdit() {
    if (this.data.loading || this.data.uploading || this.data.managing) return;
    this.setData({ editing: false, converting: false, errors: {}, managementOpen: false });
    this._draftInitialized = false;
    this.syncUser(this._certProfile || app.globalData.user || {});
    wx.pageScrollTo({ selector: "#cert-result", duration: 200 });
  },
  async confirmManagement(action) {
    const token = app.globalData.token;
    const revision = this.data.studentRevision;
    if (!token || this.data.managing || this.data.loading || this.data.uploading) return null;
    this.setData({ managing: true, "errors.manage": "", "errors.submit": "" });
    try {
      const response = await request("/me/student/manage");
      if (this._unloaded || token !== app.globalData.token) return null;
      const manage = response.data || {};
      if (Number(manage.revision) !== revision || revision !== this.data.studentRevision) {
        const error = new Error("认证状态已更新，请查看最新记录后再操作");
        error.code = "student_revision_conflict";
        throw error;
      }
      const paymentBlocks = Array.isArray(manage.paymentBlocks) ? manage.paymentBlocks : [];
      const priceReviews = Array.isArray(manage.priceReviews) ? manage.priceReviews : [];
      const blocks = paymentBlocks.concat(priceReviews);
      if (blocks.length) {
        const content = blocks.slice(0, 3).map((block) => (block.scheduleId ? "团期 #" + block.scheduleId : "") + (block.enrollmentId ? " · 报名 #" + block.enrollmentId : "") + (block.id ? " · 支付单 #" + block.id : "") + "\n" + block.message).join("\n\n");
        this.setData({ [this.data.editing ? "errors.submit" : "errors.manage"]: paymentBlocks.length ? "请先处理尚未完成的支付，再管理认证" : "请先核实旧订单价格，再管理认证" });
        await new Promise((resolve) => wx.showModal({
          title: paymentBlocks.length ? "有支付尚未处理完成" : "有旧订单需要核实", content: (paymentBlocks.length ? "请先处理以下支付，再管理认证。已结束团期的未关闭支付也会列在这里。" : "以下订单缺少当时的价格记录。请先完成或取消报名，或联系客服核实，再管理认证。") + "\n\n" + content + (blocks.length > 3 ? "\n\n还有其他待处理订单，请在订单中查看或联系客服。" : ""),
          showCancel: false, confirmText: "我知道了", confirmColor: "#5b3b8c", success: resolve, fail: resolve,
        }));
        return null;
      }
      const impact = manage.impact || {};
      let content = action === "withdraw" ? "撤回后将停止审核，资料会保留，可以修改后重新提交。" : action === "revoke" ? "解除后将移除校园认证标识，停止新的学生价和校园报名资格。重新认证需再次审核。" : "提交后原认证将暂停，新的资料通过审核后恢复相应资格。";
      content += "\n已支付并确认的行程保留原订单和价格。";
      if (Number(impact.paidConfirmed) > 0) content += "\n已支付并确认：" + Number(impact.paidConfirmed) + "笔";
      if (Number(impact.unpaid) + Number(impact.applied) + Number(impact.waitlist) > 0) {
        content += "\n待支付：" + (Number(impact.unpaid) || 0) + "笔；抽签中：" + (Number(impact.applied) || 0) + "笔；候补中：" + (Number(impact.waitlist) || 0) + "笔。";
        content += "\n支付、抽签确认或递补时会重新核验资格，可能需要重新认证或取消后重新报名。";
      }
      const confirmed = await new Promise((resolve) => wx.showModal({
        title: action === "withdraw" ? "撤回校园认证申请？" : action === "revoke" ? "解除校园认证？" : "提交认证变更？",
        content, confirmText: action === "withdraw" ? "确认撤回" : action === "revoke" ? "确认解除" : "确认提交", cancelText: "暂不操作", confirmColor: "#5b3b8c",
        success(result) { resolve(!!result.confirm); }, fail() { resolve(false); },
      }));
      if (!confirmed || this._unloaded || token !== app.globalData.token || revision !== this.data.studentRevision) return null;
      return { token, revision };
    } catch (error) {
      if (!this._unloaded && token === app.globalData.token) {
        this.setData({ [this.data.editing ? "errors.submit" : "errors.manage"]: error.message || "操作暂未完成，请稍后重试" });
        if (error.code === "student_revision_conflict") await this.refreshStatus(true);
      }
      return null;
    } finally {
      if (!this._unloaded && token === app.globalData.token) this.setData({ managing: false });
    }
  },
  withdraw() { if (this.data.pending) return this.applyManagement("withdraw"); },
  revoke() { if (this.data.certified && !this.data.editing) return this.applyManagement("revoke"); },
  async applyManagement(action) {
    const context = await this.confirmManagement(action);
    if (!context || this.data.loading) return;
    this._profileVersion = (this._profileVersion || 0) + 1;
    this.setData({ loading: true });
    try {
      const response = await request("/me/student/" + action, "POST", { revision: context.revision });
      if (this._unloaded || context.token !== app.globalData.token) return;
      setAuth(context.token, response.data);
      this.setData({ editing: false, converting: false, managementOpen: false, errors: {}, actionMessage: action === "withdraw" ? "申请已撤回，可修改资料后重新提交" : "校园认证已解除，已有订单可在行程中查看" });
      this._draftInitialized = false;
      this.syncUser(response.data || {});
      wx.pageScrollTo({ selector: "#cert-action-feedback", duration: 200 });
    } catch (error) {
      if (!this._unloaded && context.token === app.globalData.token) {
        this.setData({ "errors.manage": error.message || "操作暂未完成，请稍后重试" });
        if (error.code === "student_revision_conflict") await this.refreshStatus(true);
      }
    } finally {
      if (!this._unloaded && context.token === app.globalData.token) this.setData({ loading: false });
    }
  },
  setKind(e) {
    if (this.locked()) return;
    const kind = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.kind;
    const alumni = kind ? kind === "alumni" : Number(e.detail.value) === 1;
    if (this.data.converting && !alumni) return;
    const changedIdentity = this.data.editing && (alumni ? "alumni" : "student") !== this.data.campusKind;
    this.setData({ campusKind: alumni ? "alumni" : "student", kindIndex: alumni ? 1 : 0, kindLabel: alumni ? "毕业校友" : "在读师生", errors: {}, ...(changedIdentity ? { studentNo: "", studentCardUrl: "", cardPreviewUrl: "" } : {}) });
  },
  pickSchool() {
    if (this.locked()) return;
    const token = app.globalData.token, revision = this.data.studentRevision;
    openCampusPick({ kind: "school", title: "选择学校", selected: this.data.school,
      onPick: (names) => {
        if (this._unloaded || token !== app.globalData.token || revision !== this.data.studentRevision || this.locked()) return;
        const school = names[0] || "";
        this.setData({ school, ...(school !== this.data.school ? { college: "", major: "" } : {}), "errors.school": "", "errors.college": "", "errors.major": "", "errors.submit": "" });
      },
    });
  },
  pickCollege() {
    if (this.locked()) return;
    if (!this.data.school) { this.setData({ "errors.college": "请先选择学校" }); return; }
    const token = app.globalData.token, revision = this.data.studentRevision;
    openCampusPick({ kind: "college", school: this.data.school, title: "选择学院", selected: this.data.college,
      onPick: (names) => {
        if (this._unloaded || token !== app.globalData.token || revision !== this.data.studentRevision || this.locked()) return;
        const college = names[0] || "";
        this.setData({ college, ...(college !== this.data.college ? { major: "" } : {}), "errors.college": "", "errors.major": "", "errors.submit": "" });
      },
    });
  },
  pickMajor() {
    if (this.locked()) return;
    if (!this.data.college) { this.setData({ "errors.major": "请先选择学院" }); return; }
    const token = app.globalData.token, revision = this.data.studentRevision;
    openCampusPick({ kind: "major", school: this.data.school, college: this.data.college, title: "选择专业", selected: this.data.major,
      onPick: (names) => {
        if (this._unloaded || token !== app.globalData.token || revision !== this.data.studentRevision || this.locked()) return;
        this.setData({ major: names[0] || "", "errors.major": "", "errors.submit": "" });
      },
    });
  },
  onNo(e) {
    if (!this.locked()) this.setData({ studentNo: e.detail.value, "errors.studentNo": "", "errors.submit": "" });
  },
  login() { wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/student/student" + (this.data.redirect ? "?redirect=" + encodeURIComponent(this.data.redirect) : "")) }); },
  pickCard() {
    if (this.locked()) return;
    if (!app.globalData.token) { this.login(); return; }
    const pickerToken = app.globalData.token, pickerRevision = this.data.studentRevision;
    wx.chooseMedia({ count: 1, mediaType: ["image"],
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || this.locked() || this._unloaded || pickerToken !== app.globalData.token || pickerRevision !== this.data.studentRevision) return;
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
        } finally { if (!this._unloaded && token === app.globalData.token) this.setData({ uploading: false }); }
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
    const context = this.data.editing ? await this.confirmManagement("resubmit") : { token: app.globalData.token, revision: this.data.studentRevision };
    if (!context || this.data.loading) return;
    const token = context.token;
    this._profileVersion = (this._profileVersion || 0) + 1;
    this.setData({ loading: true });
    try {
      const res = await request("/me/student", "POST", {
        school: this.data.school.trim(), college: this.data.college.trim(), major: this.data.major.trim(),
        studentNo: this.data.campusKind === "alumni" ? "" : this.data.studentNo.trim(),
        studentCardUrl: this.data.studentCardUrl, campusKind: this.data.campusKind, revision: context.revision,
      });
      if (this._unloaded || token !== app.globalData.token) return;
      setAuth(token, res.data);
      this.setData({ editing: false, converting: false, managementOpen: false, actionMessage: "" });
      this.syncUser(res.data);
      wx.pageScrollTo({ selector: "#cert-result", duration: 200 });
    } catch (e) {
      if (!this._unloaded && token === app.globalData.token) {
        this.setData({ "errors.submit": e.message || "提交失败，请稍后再试" });
        if (e.code === "student_revision_conflict") await this.refreshStatus(true);
      }
    } finally { if (!this._unloaded && token === app.globalData.token) this.setData({ loading: false }); }
  },
  goDiscover() { app.globalData.homeCampus = true; wx.switchTab({ url: "/pages/index/index" }); },
  goBack() {
    const url = this.data.redirect;
    if (url) wx.navigateTo({ url });
    else wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/mine/mine" }) });
  },
});
