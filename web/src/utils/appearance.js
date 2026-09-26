const KEY = "bj_look";

export const SIZES = [0.9, 1, 1.12, 1.24, 1.36];

export const FONTS = {
  system: '"PingFang SC","Hiragino Sans GB","Noto Sans SC",sans-serif',
  song: '"Songti SC","STSong","Noto Serif SC","Source Han Serif SC",serif',
  kai: '"Kaiti SC","STKaiti","KaiTi",serif',
};

export const COPY = {
  zh: {
    settingsTitle: "设置",
    settingsSub: "实名、支付与账号",
    look: "外观设置",
    textMode: "文字模式",
    font: "字号设置",
    night: "夜间模式",
    lang: "语言",
    langTitle: "多语言与翻译",
    pickLang: "选择语言",
    zh: "简体中文",
    en: "English",
    tw: "繁体中文",
    fontTitle: "字体字号设置",
    preview: "效果预览",
    previewTitle: "山里信号不好时，文字模式只留行程信息。",
    previewBody: "集合时间、地点和还缺几人会更大，封面图先收起来。",
    previewNote: "同行者众",
    fontPick: "字体选择",
    system: "系统字体",
    song: "宋体",
    kai: "楷体",
    using: "使用中",
    use: "使用",
    size: "字号调整",
    standard: "标准",
    sizeHint: "拖动上方滑块，调整字号大小",
    nightTitle: "夜间模式",
    systemNight: "跟随系统",
    systemNightSub: "与手机设置保持一致的浅色或深色模式",
    day: "日间模式",
    dark: "夜间模式",
  },
  tw: {
    settingsTitle: "設定",
    settingsSub: "實名、支付與帳號",
    look: "外觀設定",
    textMode: "文字模式",
    font: "字號設定",
    night: "夜間模式",
    lang: "語言",
    langTitle: "多語言與翻譯",
    pickLang: "選擇語言",
    zh: "簡體中文",
    en: "English",
    tw: "繁體中文",
    fontTitle: "字體字號設定",
    preview: "效果預覽",
    previewTitle: "山裡訊號不好時，文字模式只留行程資訊。",
    previewBody: "集合時間、地點和還缺幾人會更大，封面圖先收起來。",
    previewNote: "同行者眾",
    fontPick: "字體選擇",
    system: "系統字體",
    song: "宋體",
    kai: "楷體",
    using: "使用中",
    use: "使用",
    size: "字號調整",
    standard: "標準",
    sizeHint: "拖動上方滑塊，調整字號大小",
    nightTitle: "夜間模式",
    systemNight: "跟隨系統",
    systemNightSub: "與手機設定保持一致的淺色或深色模式",
    day: "日間模式",
    dark: "夜間模式",
  },
  en: {
    settingsTitle: "Settings",
    settingsSub: "Identity, pay, and account",
    look: "Appearance",
    textMode: "Text mode",
    font: "Text size",
    night: "Night mode",
    lang: "Language",
    langTitle: "Language",
    pickLang: "Choose language",
    zh: "简体中文",
    en: "English",
    tw: "繁體中文",
    fontTitle: "Font and size",
    preview: "Preview",
    previewTitle: "Text mode keeps the trip facts when the signal is weak.",
    previewBody: "Time, meeting point, and open seats get larger. Covers stay hidden.",
    previewNote: "Together",
    fontPick: "Font",
    system: "System",
    song: "Song",
    kai: "Kai",
    using: "In use",
    use: "Use",
    size: "Size",
    standard: "Standard",
    sizeHint: "Drag the slider to change text size",
    nightTitle: "Night mode",
    systemNight: "Match system",
    systemNightSub: "Use the same light or dark mode as your phone",
    day: "Day",
    dark: "Night",
  },
};

export function defaults() {
  return { textMode: false, font: "system", size: 1, night: "system", lang: "zh" };
}

export function normalize(saved) {
  const look = Object.assign(defaults(), saved || {});
  if (!FONTS[look.font]) look.font = "system";
  look.size = Math.max(0, Math.min(SIZES.length - 1, Number(look.size) || 0));
  if (!["system", "day", "dark"].includes(look.night)) look.night = "system";
  if (!COPY[look.lang]) look.lang = "zh";
  look.textMode = !!look.textMode;
  return look;
}

export function isDark(look, systemDark) {
  return look.night === "dark" || (look.night === "system" && !!systemDark);
}

export function t(look) {
  return COPY[look.lang] || COPY.zh;
}

export function nightLabel(look) {
  const copy = t(look);
  if (look.night === "day") return copy.day;
  if (look.night === "dark") return copy.dark;
  return copy.systemNight;
}

export function langLabel(look) {
  const copy = t(look);
  if (look.lang === "en") return copy.en;
  if (look.lang === "tw") return copy.tw;
  return copy.zh;
}

export function readLook() {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch (e) {
    return defaults();
  }
}

export function writeLook(patch) {
  const next = normalize(Object.assign(readLook(), patch));
  localStorage.setItem(KEY, JSON.stringify(next));
  applyLook(next);
  return next;
}

export function applyLook(look, systemDark) {
  const prefs = normalize(look || readLook());
  const dark = isDark(prefs, systemDark ?? window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.night = dark ? "dark" : "day";
  root.dataset.text = prefs.textMode ? "1" : "0";
  root.dataset.lang = prefs.lang;
  root.style.setProperty("--ui-scale", String(SIZES[prefs.size]));
  root.style.setProperty("--ui-font", FONTS[prefs.font]);
  document.body.style.fontFamily = FONTS[prefs.font];
}
