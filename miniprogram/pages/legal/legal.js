const { request } = require("../../utils/request");
const { validateLegalBundle } = require("../../utils/legal");
const reviewBundle = require("../../content/legal-review.json");

Page({
  data: { loading: true, error: "", bundle: null, document: null, docId: "", reviewOnly: false },
  onLoad(query) { this.setData({ docId: query.doc || "" }); this.load(); },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const bundle = validateLegalBundle((await request("/legal")).data);
      this.showBundle(bundle);
    } catch (e) {
      if (e.status === 404) this.showBundle(reviewBundle);
      else this.setData({ error: e.message || "协议加载失败，请重试" });
    }
    finally { this.setData({ loading: false }); }
  },
  showBundle(bundle) {
    const document = bundle.documents.find((doc) => doc.id === this.data.docId) || null;
    this.setData({ bundle, document, reviewOnly: bundle.reviewOnly === true });
    wx.setNavigationBarTitle({ title: document ? document.title : "协议与隐私" });
  },
  openDocument(event) { wx.navigateTo({ url: "/pages/legal/legal?doc=" + encodeURIComponent(event.currentTarget.dataset.id) }); },
  openCenter() { wx.navigateTo({ url: "/pages/legal/legal" }); },
  goSection(event) { wx.pageScrollTo({ selector: "#legal-section-" + event.currentTarget.dataset.index, duration: 250 }); },
  copyLink(event) {
    const url = event.currentTarget.dataset.url;
    if (/^https?:\/\//i.test(String(url || ""))) wx.setClipboardData({ data: url });
  },
});
