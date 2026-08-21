function packingList(equipment) {
  return String(equipment || "")
    .split(/[、，,;；/\n]+/)
    .map((s) => s.replace(/^(请自备|装备|含)[:：]?\s*/, "").trim())
    .filter((s) => s.length >= 2 && s.length <= 48);
}

const cancelPolicy = {
  title: "退改说明",
  summary: "出发日前可自行取消；出发当天及之后不可取消。拼团解散则报名作废，已付款标记退款。",
  items: [
    "出发日之前、团未解散：可在「我的报名」取消，名额释放给候补；已付款记退款（演示环境为标记，未对接微信原路退款）。",
    "出发当天及行程开始后：不可取消，费用不退。",
    "发起人或平台解散拼团：全部报名取消，已付款标记退款，并写入取消通知。",
    "天气、景区封山等不可抗力导致无法出行时，由发起人解散或改期，已收款按解散规则处理。",
    "候补未递补前取消，不影响在团人数。",
  ],
};

const waiverText = `我已阅读线路介绍、难度、装备与注意事项，确认本人年满 18 周岁并具备完全民事行为能力（儿童须由监护人代为确认）。
我知晓京郊徒步、登山、乘车往返存在滑倒、迷路、天气骤变、野生动物、突发疾病等风险，已根据自身健康与体能评估后自愿参加。
我承诺提供真实身份与紧急联系人信息，行前按装备清单准备，服从领队现场安全安排；中途退出须告知领队，下撤费用自理。
发生意外时，平台与领队在合理范围内协助联络救援和紧急联系人；非因故意或重大过失造成的损害，按保险约定与法律规定处理。本确认不免除组织方依法应承担的安全保障义务。`;

const faqs = [
  {
    q: "报了名要马上付款吗？",
    a: "个人拼团先占座，费用待出行前支付；公司团由开团方统一结算。会员价在报名时按当时人数档位计算。",
  },
  {
    q: "人不够会不会取消？",
    a: "未达到成团人数前显示「招募中」。达到成团线后标记「已成团·铁定出发」并匹配导游。发起人仍可在出发前解散，须填写理由。",
  },
  {
    q: "满员了还能去吗？",
    a: "可以加入候补。有人取消后按报名顺序自动递补并短信通知。候补期间不占座位。",
  },
  {
    q: "集合点怎么找？",
    a: "排期页展示集合点与时间，可打开地图定位到具体位置。请提前 10 分钟到达，超时可能无法等候。",
  },
  {
    q: "一定要买保险吗？",
    a: "建议购买户外意外险。不购买则出行风险自担。导游端能看到你是否已加购。",
  },
  {
    q: "为什么要紧急联系人？",
    a: "户外活动遇突发情况时，领队需要立刻联系你的家人或同伴。联系人手机不能与出行人手机相同。",
  },
];

const MEETUP_POIS = {
  东直门东方银座C口: { lng: 116.4356, lat: 39.9412, name: "东直门东方银座C口" },
  西直门凯德mall北门外: { lng: 116.3554, lat: 39.9406, name: "西直门凯德MALL北门" },
  国贸桥下大巴停靠点: { lng: 116.4617, lat: 39.9087, name: "国贸桥下大巴停靠点" },
  丽泽桥西南角: { lng: 116.3142, lat: 39.8684, name: "丽泽桥西南角" },
};

function meetupMap(point) {
  const text = String(point || "").trim();
  if (!text) return { url: "", name: "", lat: null, lng: null, precise: false };
  const poi = MEETUP_POIS[text] || Object.entries(MEETUP_POIS).find(([k]) => text.includes(k) || k.includes(text))?.[1];
  if (poi) {
    const name = encodeURIComponent(poi.name);
    return {
      url: `https://uri.amap.com/marker?position=${poi.lng},${poi.lat}&name=${name}&src=beiyexing`,
      name: poi.name,
      lat: poi.lat,
      lng: poi.lng,
      precise: true,
    };
  }
  const q = encodeURIComponent(text);
  return {
    url: `https://uri.amap.com/search?keyword=${q}&src=beiyexing`,
    name: text,
    lat: null,
    lng: null,
    precise: false,
  };
}

function meetupMapUrl(point) {
  return meetupMap(point).url;
}

const contacts = {
  officialWechat: "beiyexing",
  officialWechatName: "北野行官方",
  officialGroup: "北野行户外交流群",
  hint: "添加官方微信后拉入用户群。本团咨询群由领队确认后显示在行程页。",
};

const officialAccounts = [
  { platform: "微信公众号", name: "北野行官方", id: "beiyexing", remark: "活动预告与成团通知" },
  { platform: "微信小程序", name: "北野行", id: "北野行", remark: "报名、选座、查看行程" },
  { platform: "视频号", name: "北野行", id: "北野行", remark: "线路实拍与行前说明" },
  { platform: "小红书", name: "北野行户外", id: "@beiyexing", remark: "目的地攻略与成团日记" },
  { platform: "抖音", name: "北野行户外", id: "@beiyexing", remark: "短视频看路况与风景" },
  { platform: "微博", name: "北野行", id: "@北野行", remark: "天气与集合点提醒" },
];

const leaderRecruitCopy = "推荐领队 首次带队完成后 奖励推荐者200元";

const commonRules = {
  title: "各线路公共规则",
  summary: "以下规则适用于北野行全部线路；各团行程页的装备、集合点以当次排期为准。",
  sections: [
    {
      title: "成团与出发",
      items: [
        "未达最低成团人数前显示招募中；达到成团线后铁定出发并安排领队。",
        "一个团最多两位领队。还没有领队时可在行程页点「报名领队」。",
        "人数不足或天气封山时，发起人可解散；已付款标记退款。",
      ],
    },
    {
      title: "报名与座位",
      items: [
        "早报名早选座。报名前点座位图会提示先报名；报名后可在座位图改座。",
        "个人拼团先占座，费用待出行前支付；公司团由开团方统一结算。",
        "满员可候补。有人取消后按顺序递补。",
      ],
    },
    {
      title: "不成团时的备选",
      items: [
        "报名后可勾选多个候选团：本团未成团时，按你选的顺序自动转到别的团，价格多退少补。",
        "也可打开「替代团」：本团未成团时，自动加入相同行程的其他日期。",
      ],
    },
    {
      title: "推荐与领队",
      items: [
        leaderRecruitCopy + "。",
        "推荐好友报名成功后，按人数结算报名费的 5%。",
      ],
    },
    {
      title: "装备与安全",
      items: [
        "请按行程页装备清单准备；儿童须由监护人确认风险告知。",
        "服从领队现场安排；中途退出须告知领队，下撤费用自理。",
      ],
    },
    { title: "退改", items: cancelPolicy.items },
  ],
};

module.exports = {
  packingList,
  cancelPolicy,
  waiverText,
  faqs,
  meetupMapUrl,
  meetupMap,
  MEETUP_POIS,
  contacts,
  officialAccounts,
  commonRules,
  leaderRecruitCopy,
};
