const fs = require("fs");
const path = require("path");

/** Wikimedia Commons file title -> local photo key (saved as {key}.jpg) */
const COMMONS_FILES = {
  shangfangCave: "上方山云水洞.jpg",
  shiduJuma: "十渡拒马河.jpg",
  shiduBend: "十二渡,拒马河在这里转了个弯 - Juma River Big Bend at the Twelfth Ferry - 2011.04 - panoramio.jpg",
  lingshan: "灵山美景 - Scenery of Lingshan Mountain - 2016.08 - panoramio.jpg",
  baihuaMeadow: "百花山北草甸 - North Meadows of Baihua Mountain - 2012.08 - panoramio.jpg",
  baihuaSunrise: "日出百花山 - Sunrise at Baihua Mountain - 2012.08 - panoramio.jpg",
  baihuaTrail: "登山步道 - Baihua Mountain Trail - 2012.08 - panoramio.jpg",
  baihuaGate: "百花山北门 - North Entrance of Baihua Mountain Geoarea - 2012.08 - panoramio.jpg",
  fenghuang1: "Fenghuangling, Beijing 2703.jpg",
  fenghuang2: "凤凰岭.JPG",
  longqing1: "龙庆峡20160628-2.jpg",
  longqingBoat: "泛舟龙庆峡 - panoramio.jpg",
  longqingCable: "Cable car longqing gorge.jpg",
  longqingView: "龙庆峡风光 - panoramio.jpg",
  yanqiDam: "Yanqi Lake from the southern dam (20201027163020).jpg",
  yanqiPark: "雁栖湖公园 03.jpg",
  qinglongAerial:
    "自烽火台看龙峡湖鸟瞰图 (A bird's-eye-perspective of Longxia (Dragon Valley) Lake from a fort in Qinglongxia (Black Dragon Valley)) - panoramio.jpg",
  tianyunGlass: "Glass platform at Tianyun Mountain.jpg",
  tianyunBridge: "Glass bridge at Tianyun Mountain.jpg",
  haiziPinggu: "Haizi Reservoir in Pinggu Beijing.jpg",
  shilinxiaUfo: "UFO platform Pinggu.jpg",
  shuanglong1:
    "Baihuashan mts Shuanglongxia Reserve and Shuanglongxia Reserve Qingshui River valley IMG 4180 Fangshan and Mentougou, Beijing.jpg",
  shuanglong2: "Baihuashan mts Shuanglongxia Reserve and Qingshui River valley IMG 4178 Fangshan and Mentougou, Beijing.jpg",
  shuanglong3: "Baihuashan mts Shuanglongxia Reserve and Qingshui River valley IMG 4179 Fangshan and Mentougou, Beijing.jpg",
  taoyuan1: "桃源仙谷 - panoramio.jpg",
  taoyuan2: "桃源仙谷，南山回路，远眺密云水库 - panoramio.jpg",
  taoyuan3: "桃源仙谷，下山时偶遇彩虹 - panoramio.jpg",
  taoyuan4: "桃源仙谷 - Taoyuan Fairy Valley - 2012.03 - panoramio.jpg",
  miaofeng: "妙峰山.JPG",
  miaofengGold: "金顶妙峰山 - panoramio.jpg",
  miaofengView: "俯瞰金顶妙峰山 - panoramio.jpg",
  miaofengGate: "金顶妙峰山门 - panoramio.jpg",
  chengdeResort: "Chengde Mountain Resort 1.jpg",
  chengdePagoda: "Chengde Mountain Resort, Pagoda.jpg",
  chengdeJinshan: "避暑山庄小金山.jpg",
  puning: "普宁寺大乘之阁2025.11.jpg",
  putuoZongcheng: "Putuo Zongcheng Temple.jpg",
  cuandi1: "Cuandixia Village.jpg",
  cuandi2: "爨底下村-20240503.jpg",
  cuandiPanorama: "爨底下村全景 - Panorama of Cuandixia Village - 2011.10 - panoramio.jpg",
  shanhaiguan: "Shanhaiguan.jpg",
  firstPass: "河北省 天下第一关 - panoramio.jpg",
  laolongtou: "Old Dragon's Head of Great Wall.jpg",
  laolongtouSea: "Seashore for Bohai at Laolongtou Site.jpg",
  beidaihe: "Beidaihe panorama from the south.jpg",
  yesanpo: "Yesanpuo.jpg",
  saihanba: "Saihanba park.jpg",
  ulanbutong: "P8050566WuLanBuTong.JPG",
  jingdong: "Jingdongdaxiagu.JPG",
  jinshan5: "Great Wall of China at Jinshanling 5.jpg",
  simatai2: "Simatai Great Wall.JPG",
  wutaiMount: "Mount Wutai.JPG",
  yungang2: "61292-Yungang-Grottoes (28498548881).jpg",
  xuankong1: "Hunyuan Xuankong Si 2013.08.30 09-02-11.jpg",
  xuankong2: "Xuankongsi.jpg",
  xuankong3: "悬空寺1.JPG",
  xuankong4: "山西悬空寺.jpg",
  baishiWall: "白石山长城.JPG",
  taihang1: "TaihangMountain.jpg",
  taihang3: "TaihangMountain3.jpg",
  taihang7: "TaihangMountain7.jpg",
  wulingPeak: "雾灵山顶峰 - panoramio.jpg",
  wulingAutumn: "雾灵山秋景 - panoramio.jpg",
  wulingCable: "雾灵山 缆车 - panoramio.jpg",
  wulingView: "雾灵山 - panoramio - Tiger@西北.jpg",
  mutianyu2: "The Mutianyu section of the Great Wall of China.jpg",
  mutianyu3: "Mutianyu Great Wall (6222519140).jpg",
  mutianyu4: "Great wall of china-mutianyu 4.JPG",
  mutianyu5: "67052-The-Great-Wall, Mutianyu.jpg",
  huanghua1: "黄花城长城.jpeg",
  huanghua2: "Great Wall of China at Huanghuacheng (west) Summer 35.jpg",
  huanghua3: "Great Wall of China at Huanghuacheng (west) Summer 22.jpg",
  huanghuaWinter: "Great Wall of China at Huanghuacheng (west) Winter 16.jpg",
  badaling2: "Badaling China Great-Wall-of-China-02.jpg",
  badaling3: "Badaling China Great-Wall-of-China-07.jpg",
  badaling4: "Peking Great Wall-20071019-RM-113500.jpg",
  zhangbeiSkyline: "Zhangbei Grass Skyline from the ferris wheel (20210731135013).jpg",
  zhangbeiWheel: "Ferris wheel at Zhangbei Grass Skyline (20210731130447).jpg",
  chongliAutumn1: "Golden forests at Chongli 崇礼金秋 (8181833932).jpg",
  chongliAutumn2: "Golden forests at Chongli 崇礼金秋 (8181820165).jpg",
  chongliAutumn3: "Golden forests at Chongli 崇礼金秋 (8181862528).jpg",
  wanlongSki: "万龙雪场 - panoramio.jpg",
  miyunRes: "Miyun Reservoir 2019.jpg",
  fengningMeadow: "Fengning Jing Bei meadow.jpg",
};

const UA = "bj-outdoor-trip/1.0 (local demo; cover images)";
const MIN_BYTES = 15000;
const MAX_TRIES = 4;
const SLEEP_MS = 2200;

function commonsUrl(fileTitle) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileTitle)}?width=1280`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveDirectUrl(fileTitle) {
  const api =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      titles: `File:${fileTitle}`,
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: "1280",
      format: "json",
    });
  const res = await fetch(api, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`api ${res.status}`);
  const data = await res.json();
  const page = Object.values(data.query?.pages || {})[0];
  const info = page?.imageinfo?.[0];
  return info?.thumburl || info?.url || null;
}

async function downloadOne(key, fileTitle, destDir) {
  const dest = path.join(destDir, `${key}.jpg`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > MIN_BYTES) {
    console.log("exists", key);
    return dest;
  }
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_TRIES; attempt += 1) {
    try {
      const direct = await resolveDirectUrl(fileTitle);
      const url = direct || commonsUrl(fileTitle);
      const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        console.warn("retry", key, lastErr, "try", attempt);
        await sleep(2000 * attempt);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < MIN_BYTES) {
        lastErr = `tiny ${buf.length}`;
        console.warn("tiny", key, buf.length);
        return null;
      }
      fs.writeFileSync(dest, buf);
      console.log("ok", key, buf.length, fileTitle);
      return dest;
    } catch (err) {
      lastErr = err.message || String(err);
      console.warn("retry", key, lastErr, "try", attempt);
      await sleep(2000 * attempt);
    }
  }
  console.warn("fail", key, lastErr, fileTitle);
  return null;
}

async function downloadPlacePhotos(destDir) {
  const dir = destDir || path.join(__dirname, "../../public/static/photos");
  fs.mkdirSync(dir, { recursive: true });
  const urls = {};
  for (const [key, fileTitle] of Object.entries(COMMONS_FILES)) {
    const dest = path.join(dir, `${key}.jpg`);
    const existed = fs.existsSync(dest) && fs.statSync(dest).size > MIN_BYTES;
    await downloadOne(key, fileTitle, dir);
    urls[key] = commonsUrl(fileTitle);
    if (!existed) await sleep(SLEEP_MS);
  }
  fs.writeFileSync(path.join(__dirname, "place-photo-urls.json"), JSON.stringify(urls, null, 2));
  return urls;
}

async function main() {
  await downloadPlacePhotos();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { COMMONS_FILES, downloadOne, downloadPlacePhotos, commonsUrl, sleep };
