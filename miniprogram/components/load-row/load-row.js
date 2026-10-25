Component({
  data: { lang: "zh" },
  lifetimes: {
    attached() {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      const lang = page && page.data && page.data.lang;
      if (lang) this.setData({ lang });
    },
  },
});
