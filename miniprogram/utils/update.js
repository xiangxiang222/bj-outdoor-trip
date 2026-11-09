let initialized = false;
let manager = null;
let foreground = false;
let ready = false;
let prompted = false;
let prompting = false;
let blocked = false;

function promptUpdate() {
  if (!foreground || !ready || prompted || prompting || blocked) return;
  prompted = true;
  prompting = true;
  wx.showModal({
    title: "发现新版本",
    content: "新版本已准备好，是否重新加载？建议先完成当前操作。",
    confirmText: "立即更新",
    cancelText: "稍后再说",
    success(res) {
      if (res.confirm) manager.applyUpdate();
    },
    fail() {
      // A failed bridge call should not consume this session's update reminder.
      prompted = false;
    },
    complete() {
      prompting = false;
    },
  });
}

function init() {
  if (initialized) return;
  initialized = true;
  if (typeof wx.getUpdateManager !== "function") return;
  manager = wx.getUpdateManager();
  manager.onUpdateReady(() => {
    ready = true;
    promptUpdate();
  });
  manager.onUpdateFailed(() => {
    ready = false;
  });
}

function onShow() {
  foreground = true;
  promptUpdate();
}

function onHide() {
  foreground = false;
}

function isPrompting() {
  return prompting;
}

function setBlocked(value) {
  blocked = value;
  if (!blocked) promptUpdate();
}

module.exports = { init, onShow, onHide, isPrompting, setBlocked };
