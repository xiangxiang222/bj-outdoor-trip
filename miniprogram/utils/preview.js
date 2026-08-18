const PREVIEW_DIR_NAME = "preview";
const PREVIEW_TIMEOUT_MS = 30000;

function previewDir() {
  return `${wx.env.USER_DATA_PATH}/${PREVIEW_DIR_NAME}`;
}

function previewPath(key) {
  return `${previewDir()}/${key}.jpg`;
}

function photoKey(src, thumb) {
  const fromSrc = String(src || "").match(/\/static\/photos\/([^/?#]+)\./i);
  if (fromSrc) return fromSrc[1];
  const fromThumb = String(thumb || "").match(/([^/]+)\.(jpe?g|png)$/i);
  return fromThumb ? fromThumb[1] : "photo";
}

function ensurePreviewDir() {
  return new Promise((resolve) => {
    wx.getFileSystemManager().mkdir({
      dirPath: previewDir(),
      recursive: true,
      complete() {
        resolve();
      },
    });
  });
}

function fileExists(filePath) {
  return new Promise((resolve) => {
    wx.getFileSystemManager().access({
      path: filePath,
      success() {
        resolve(true);
      },
      fail() {
        resolve(false);
      },
    });
  });
}

function writeBinary(filePath, data) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath,
      data,
      success() {
        resolve(filePath);
      },
      fail(err) {
        reject(err);
      },
    });
  });
}

function requestBuffer(url) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: "GET",
      responseType: "arraybuffer",
      timeout: PREVIEW_TIMEOUT_MS,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
          resolve(res.data);
          return;
        }
        reject(new Error("HTTP " + res.statusCode));
      },
      fail(err) {
        reject(err);
      },
    });
  });
}

function downloadToFile(url, filePath) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      timeout: PREVIEW_TIMEOUT_MS,
      success(res) {
        if (res.statusCode === 200 && res.tempFilePath) {
          wx.getFileSystemManager().saveFile({
            tempFilePath: res.tempFilePath,
            filePath,
            success() {
              resolve(filePath);
            },
            fail() {
              resolve(res.tempFilePath);
            },
          });
          return;
        }
        reject(new Error("HTTP " + (res.statusCode || 0)));
      },
      fail(err) {
        reject(err);
      },
    });
  });
}

async function cacheFromUrl(url, filePath) {
  const data = await requestBuffer(url);
  await writeBinary(filePath, data);
  return filePath;
}

async function resolveOne(item) {
  const thumb = item.thumb || "";
  const src = item.src || "";
  const origin = item.origin || "";
  const key = photoKey(src, thumb);
  const dest = previewPath(key);
  if (await fileExists(dest)) return dest;

  const app = getApp();
  const localUrl = src && app.globalData.baseUrl ? app.globalData.baseUrl + src : "";
  if (localUrl) {
    try {
      return await cacheFromUrl(localUrl, dest);
    } catch (err) {
      /* try HTTPS original next */
    }
  }
  if (/^https:\/\//i.test(origin)) {
    try {
      return await cacheFromUrl(origin, dest);
    } catch (err) {
      try {
        return await downloadToFile(origin, dest);
      } catch (downloadErr) {
        /* fall back to thumbnail */
      }
    }
  }
  return thumb;
}

function asGalleryItem(item) {
  if (!item) return { thumb: "", src: "", origin: "" };
  if (typeof item === "string") return { thumb: item, src: "", origin: "" };
  return item;
}

async function resolvePreviewUrls(gallery) {
  await ensurePreviewDir();
  const items = (Array.isArray(gallery) ? gallery : []).map(asGalleryItem);
  return Promise.all(items.map((item) => resolveOne(item)));
}

module.exports = { resolvePreviewUrls };
