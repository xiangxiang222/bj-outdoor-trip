/** 默认走线上。本地联调 API 时把 USE_LOCAL_API 改成 true。 */
const USE_LOCAL_API = false;
const DEVTOOLS_URL = "http://127.0.0.1:3780";
const LOCAL_PHONE_URL = "http://192.168.1.72:3780";
const PROD_URL = "http://192.144.167.212";

function getBaseUrl() {
  if (!USE_LOCAL_API) return PROD_URL;
  try {
    if (wx.getSystemInfoSync().platform === "devtools") return DEVTOOLS_URL;
  } catch (e) {
    /* ignore */
  }
  return LOCAL_PHONE_URL;
}

module.exports = {
  baseUrl: getBaseUrl(),
  devtoolsUrl: DEVTOOLS_URL,
  phoneUrl: LOCAL_PHONE_URL,
  prodUrl: PROD_URL,
};
