const { request, showError } = require("../../utils/request");

Page({
  data: { cards: [], banks: ["招商银行", "工商银行", "建设银行", "农业银行", "中国银行", "其他"], bankIndex: 0, holderName: "", cardNo: "" },
  onShow() {
    this.load();
  },
  async load() {
    try {
      const res = await request("/me/wallet");
      this.setData({
        cards: (res.data && res.data.cards) || [],
        banks: (res.data && res.data.banks) || this.data.banks,
      });
    } catch (e) {
      showError("加载失败", e);
    }
  },
  setHolder(e) {
    this.setData({ holderName: e.detail.value });
  },
  setBank(e) {
    this.setData({ bankIndex: Number(e.detail.value) });
  },
  setCard(e) {
    this.setData({ cardNo: e.detail.value });
  },
  async add() {
    try {
      await request("/me/wallet/cards", "POST", {
        holderName: this.data.holderName,
        bankName: this.data.banks[this.data.bankIndex],
        cardNo: this.data.cardNo,
      });
      this.setData({ cardNo: "" });
      wx.showToast({ title: "已绑定", icon: "none" });
      this.load();
    } catch (e) {
      showError("绑定失败", e);
    }
  },
  remove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "解绑银行卡",
      content: "确定解绑这张卡？",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await request("/me/wallet/cards/" + id, "DELETE");
          this.load();
        } catch (err) {
          showError("解绑失败", err);
        }
      },
    });
  },
});
