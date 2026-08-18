function failMessage(err, baseUrl) {
  const raw = String((err && (err.errMsg || err.message)) || "");
  if (/url not in domain list/i.test(raw)) {
    return "请在开发者工具右上角「详情 → 本地设置」勾选「不校验合法域名、web-view、TLS 以及 HTTPS 证书」。";
  }
  if (/ssl|certificate|tls/i.test(raw)) {
    return "证书校验失败。开发阶段请勾选不校验 TLS / HTTPS 证书。";
  }
  if (/timeout/i.test(raw)) {
    return "请求超时，连不上 " + (baseUrl || "接口") + "。";
  }
  if (/fail/i.test(raw) || !raw) {
    return "连不上接口 " + (baseUrl || "") + "。请确认开发者工具勾选「不校验合法域名」。";
  }
  return raw;
}

function request(path, method, data) {
  const app = getApp();
  const baseUrl = app.globalData.baseUrl;
  return new Promise((resolve, reject) => {
    wx.request({
      url: baseUrl + "/api" + path,
      method: method || "GET",
      data,
      timeout: 15000,
      header: {
        "content-type": "application/json",
        Authorization: app.globalData.token ? "Bearer " + app.globalData.token : "",
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.ok) {
          resolve(res.data);
          return;
        }
        if (res.statusCode === 401) {
          reject(new Error("请先登录"));
          return;
        }
        reject(new Error((res.data && res.data.message) || "HTTP " + res.statusCode));
      },
      fail(err) {
        reject(new Error(failMessage(err, baseUrl)));
      },
    });
  });
}

function setAuth(token, user) {
  const app = getApp();
  app.globalData.token = token;
  app.globalData.user = user;
  wx.setStorageSync("bj_token", token);
  wx.setStorageSync("bj_user", user);
}

function showError(title, err) {
  const content = (err && err.message) || String(err || "请稍后重试");
  wx.showModal({ title: title || "出错了", content, showCancel: false });
}

module.exports = { request, setAuth, showError };
