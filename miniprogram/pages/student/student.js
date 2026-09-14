const { request, setAuth } = require("../../utils/request");
const { openCampusPick } = require("../../utils/campus");
const app = getApp();

function uploadFile(filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: app.globalData.baseUrl + "/api/upload",
      filePath,
      name: "file",
      header: { Authorization: app.globalData.token ? "Bearer " + app.globalData.token : "" },
      success(res) {
        try {
          const data = JSON.parse(res.data || "{}");
          if (data.ok && data.data && data.data.url) {
            resolve(data.data.url);
            return;
          }
          reject(new Error((data && data.message) || "上传失败"));
        } catch {
          reject(new Error("上传失败"));
        }
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || "上传失败"));
      },
    });
  });
}

Page({
  data: {
    campusKind: "student",
    kindIndex: 0,
    kindLabels: ["在读师生", "校友"],
    kindLabel: "师生",
    school: "",
    college: "",
    major: "",
    studentNo: "",
    studentCardUrl: "",
    placeText: "",
    certified: false,
    pending: false,
    rejected: false,
    loading: false,
    redirect: "",
  },
  onLoad(q) {
    this.setData({ redirect: q.redirect || "" });
  },
  onShow() {
    this.syncUser(app.globalData.user || {});
  },
  syncUser(u) {
    const certified = !!(u.isStudent || u.isAlumni);
    const school = certified ? u.school || "" : this.data.school || u.school || "";
    const college = certified ? u.college || "" : this.data.college || u.college || "";
    const major = certified ? u.major || "" : this.data.major || u.major || "";
    const campusKind = u.campusKind === "alumni" ? "alumni" : "student";
    const bits = [school, college, major].filter(Boolean);
    this.setData({
      school,
      college,
      major,
      studentNo: certified ? u.studentNo || "" : this.data.studentNo || u.studentNo || "",
      studentCardUrl: this.data.studentCardUrl || u.studentCardUrl || "",
      campusKind,
      kindIndex: campusKind === "alumni" ? 1 : 0,
      kindLabel: campusKind === "alumni" ? "校友" : "师生",
      placeText: bits.length ? " · " + bits.join(" ") : "",
      certified,
      pending: u.studentStatus === "pending",
      rejected: u.studentStatus === "rejected",
    });
  },
  setKind(e) {
    const i = Number(e.detail.value);
    this.setData({ campusKind: i === 1 ? "alumni" : "student", kindIndex: i, kindLabel: i === 1 ? "校友" : "师生" });
  },
  pickSchool() {
    if (this.data.certified) return;
    openCampusPick({
      kind: "school",
      title: "选择学校",
      selected: this.data.school,
      onPick: (names) => this.setData({ school: names[0] || "", college: "", major: "" }),
    });
  },
  pickCollege() {
    if (this.data.certified) return;
    openCampusPick({
      kind: "college",
      school: this.data.school,
      title: "选择学院",
      selected: this.data.college,
      onPick: (names) => this.setData({ college: names[0] || "", major: "" }),
    });
  },
  pickMajor() {
    if (this.data.certified) return;
    openCampusPick({
      kind: "major",
      school: this.data.school,
      college: this.data.college,
      title: "选择专业",
      selected: this.data.major,
      onPick: (names) => this.setData({ major: names[0] || "" }),
    });
  },
  onNo(e) {
    this.setData({ studentNo: e.detail.value });
  },
  pickCard() {
    if (this.data.certified) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        try {
          wx.showLoading({ title: "上传中", mask: true });
          const url = await uploadFile(file.tempFilePath);
          this.setData({ studentCardUrl: url });
        } catch (e) {
          wx.showToast({ title: (e && e.message) || "上传失败", icon: "none" });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },
  async submit() {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/student/student") });
      return;
    }
    this.setData({ loading: true });
    try {
      const res = await request("/me/student", "POST", {
        school: this.data.school,
        college: this.data.college,
        major: this.data.major,
        studentNo: this.data.studentNo,
        studentCardUrl: this.data.studentCardUrl,
        campusKind: this.data.campusKind,
      });
      setAuth(app.globalData.token, res.data);
      this.syncUser(res.data);
      wx.showToast({ title: res.message || "已提交", icon: "none" });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || "提交失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },
  goBack() {
    const url = this.data.redirect;
    if (url) wx.navigateTo({ url });
    else wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/mine/mine" }) });
  },
});
