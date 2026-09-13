<template>
  <div v-if="s" class="trip-detail">
    <div class="card" style="border-radius:0;margin:0">
      <div class="hero-swipe" v-if="gallery.length" @click="previewHero">
        <img :src="gallery[heroIndex]" :alt="s.route.title" />
        <div class="hero-dots" v-if="gallery.length > 1">
          <i v-for="(g, i) in gallery" :key="g" :class="{ on: i === heroIndex }" />
        </div>
      </div>
      <div class="pad trip-head">
        <div class="row">
          <strong>
            <span v-if="s.offerLabel" class="offer-chip inline" :style="{ background: s.offerColor }">{{ s.offerLabel }}</span>
            {{ s.route.title }}
          </strong>
          <span class="tag">{{ statusTag }}</span>
        </div>
        <div class="tag-row">
          <span class="play-tag sm" v-for="t in s.playTags || s.route.tags || []" :key="t.id || t" :style="{ background: t.color || '#2d6a4f' }">{{ t.name || t }}</span>
        </div>
        <div class="row" style="margin-top:10px">
          <span v-if="isActivity && isFree" class="tag">免费</span>
          <span v-else-if="isActivity" class="price">¥{{ s.quote?.price }}</span>
          <TripPrices v-else :quote="s.quote" compact />
          <span class="muted">{{ whenText }}</span>
        </div>
      </div>
    </div>

    <GoodsTabs v-model="tab" :tabs="tabItems" :label="isActivity ? '局详情分段' : '团详情分段'" />

    <div v-show="tab === 'trip'" class="trip-pane">
      <div class="card">
        <div class="pad">
          <div class="fact-list">
            <div class="fact-row">
              <span class="fact-k">时间</span>
              <span class="fact-v">{{ whenText }}</span>
            </div>
            <div class="fact-row">
              <span class="fact-k">{{ isActivity ? "地点" : "集合" }}</span>
              <span class="fact-v">{{ placeText }}</span>
              <a v-if="s.meetupMapUrl" class="nav-link" :href="s.meetupMapUrl" target="_blank" rel="noreferrer">地图</a>
            </div>
            <div class="fact-row">
              <span class="fact-k">人数</span>
              <span class="fact-v">{{ peopleText }}</span>
            </div>
            <div class="fact-row">
              <span class="fact-k">发起</span>
              <span class="fact-v">
                <a v-if="s.organizerId" class="nav-link" href="#" @click.prevent="goUser(s.organizerId)">{{ s.organizerName }}</a>
                <span v-else>{{ s.organizerName }}</span>
                <span v-if="s.companyName">（{{ s.companyName }}）</span>
              </span>
            </div>
          </div>
          <p v-if="s.guaranteed && !isActivity" class="muted" style="color:var(--leaf)">已成团 · 铁定出发（人数已达最低成团线）</p>
          <div class="trust-row">
            <span class="trust-chip" v-for="c in trusts" :key="c">{{ c }}</span>
          </div>
          <div v-if="ticket" class="ticket-card" :class="{ wait: ticket.kind === 'waitlist', posted: ticket.kind === 'posted' }">
            <strong>{{ ticket.title }}</strong>
            <p class="muted" style="margin:6px 0 0">{{ ticket.sub }}</p>
            <div class="ticket-actions">
              <button v-if="ticket.trips" class="btn ghost" type="button" @click="$router.push('/m/orders')">看行程</button>
              <button v-if="ticket.share" class="btn" type="button" @click="share">去分享</button>
            </div>
          </div>
          <p v-if="!isActivity">
            <a v-if="busPhotos.length" class="nav-link" href="#" @click.prevent="showBus = true">{{ busText }}</a>
            <span v-else>{{ busText }}</span>
          </p>
          <div class="progress"><i :style="{ width: Math.min(100, (shownEnrolled / s.maxSeats) * 100) + '%' }"></i></div>
          <div class="row">
            <span v-if="s.minGroupSize || s.oversub?.label" class="muted">{{ isActivity ? "满 " + s.minGroupSize + " 人成局" : "最低成团 " + s.minGroupSize }}<template v-if="s.oversub?.label"> · {{ s.oversub.label }}</template></span>
            <span v-else></span>
          </div>
          <p class="muted" v-if="s.oversub?.enabled">{{ s.oversub.copy }}</p>
          <p class="muted" v-if="s.eligibility?.enabled">{{ s.eligibility.label }}{{ s.eligibility.schools?.length ? (s.eligibility.alumniOk ? " 已认证师生或校友可报" : " 已认证学生可报") : "" }}</p>
          <p v-if="s.eligibility?.enabled && !s.eligibility.canEnroll" class="muted" style="color:var(--clay)">
            {{ s.eligibility.reason }}
            <router-link to="/m/student">去校园认证</router-link>
          </p>
          <p class="muted" v-if="s.reviewStatus === 'pending'" style="color:#c77d3a">本团正在审核，通过后才会出现在{{ isActivity ? "活动页" : "首页" }}，暂不能报名。</p>
          <p class="muted" v-else-if="s.reviewStatus === 'rejected'" style="color:var(--clay)">本团未通过审核。</p>
          <p class="muted" v-if="s.status === 'cancelled'" style="color:var(--clay)">
            本团已解散。理由：{{ s.cancelReason }}
          </p>
          <p v-if="s.notes" class="muted">{{ s.notes }}</p>
          <div v-if="s.coupon" class="card" style="margin:12px 0 0;background:#fff7e6" @click="$router.push('/m/coupon/' + s.coupon.code)">
            <div class="pad">
              <strong>{{ s.coupon.label }}</strong>
              <span class="muted"> 余 {{ s.coupon.remain }}/{{ s.coupon.total }} · 点此领取</span>
            </div>
          </div>
          <div class="leader-board" v-if="!isActivity">
            <div class="leader-slot" v-for="slot in leaderSlots" :key="slot.slot">
              <template v-if="slot.leader">
                <a class="nav-link" href="#" @click.prevent="openLeader(slot.leader)">
                  <img v-if="slot.leader.avatar" class="leader-face" :src="slot.leader.avatar" alt="" />
                  <span v-else class="leader-face">{{ (slot.leader.name || "领").slice(0, 1) }}</span>
                  {{ slot.label }} {{ slot.leader.name }}
                </a>
              </template>
              <a v-else class="nav-link" href="#" @click.prevent="applyLeader(slot.slot)">{{ slot.label }} · 报名领队</a>
            </div>
            <div class="leader-slot">
              <template v-if="s.photographer">
                <a class="nav-link" href="#" @click.prevent="openLeader(s.photographer)">
                  <img v-if="s.photographer.avatar" class="leader-face" :src="s.photographer.avatar" alt="" />
                  <span v-else class="leader-face">{{ (s.photographer.name || "摄").slice(0, 1) }}</span>
                  摄影师 {{ s.photographer.name }}
                </a>
              </template>
              <a v-else class="nav-link" href="#" @click.prevent="applyPhotographer">摄影师 · 报名摄影师</a>
            </div>
            <p class="muted">{{ s.leaderRecruitCopy }}</p>
            <div v-if="leaderNeedApply" class="card" style="margin-top:8px">
              <div class="pad">
                <p style="margin:0 0 10px">{{ leaderNeedApplyText }}</p>
                <button class="btn block" type="button" @click="goLeaderApply">{{ leaderNeedApplyCta }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <template v-if="!isActivity && weather">
        <div class="h2">出行天气</div>
        <div class="card"><div class="pad">
          <div class="weather" :class="weather.alerts?.[0]?.level">
            <strong>{{ weather.place }} {{ weather.summary }}</strong>
            <span>{{ weather.tmin }}~{{ weather.tmax }}℃ · 风 {{ weather.wind }}km/h</span>
            <WeatherChart :hourly="weather.hourly" :label="weather.place + '分时气温'" />
            <p v-for="(a, i) in weather.alerts" :key="i">{{ a.text }}</p>
          </div>
        </div></div>
      </template>

      <template v-if="!isActivity">
        <div class="h2">座位图</div>
        <div class="card"><div class="pad">
          <div class="seat-map">
            <div class="seat-front">车头</div>
            <div class="seat-row" v-for="row in seatRows" :key="row[0].row">
              <template v-for="seat in row" :key="seat.no">
                <span
                  class="seat"
                  :class="{ taken: seat.taken && !seat.locked, locked: seat.locked, mine: seat.mine, face: !!seat.occupant }"
                  @click="onSeat(seat)"
                >
                  <img v-if="seat.occupant?.avatar" :src="seat.occupant.avatar" alt="" />
                  <template v-else-if="seat.occupant">{{ seat.occupant.initial }}<span class="seat-age">{{ genderMark(seat.occupant.gender) }}{{ seat.occupant.lifeStage }}</span></template>
                  <template v-else-if="seat.locked">锁</template>
                  <template v-else>{{ seat.col }}</template>
                </span>
                <i v-if="seat.aisleAfter" class="seat-aisle" />
              </template>
            </div>
          </div>
          <p class="muted">{{ seatHint }}</p>
        </div></div>
      </template>

      <div class="h2" v-if="s.myEnrollment">报名后</div>
      <div class="card" v-if="s.myEnrollment"><div class="pad">
        <template v-if="isActivity">
          <p style="margin-top:0">已报名。到场时找发起人即可。</p>
          <p>本局微信群</p>
          <img v-if="s.consultGroupQr" :src="s.consultGroupQr" alt="本局群二维码" style="width:140px;height:140px;background:#fff;border-radius:12px" />
          <p class="muted">{{ s.consultGroup || contacts.officialWechat }}</p>
          <button v-if="s.myEnrollment.status === 'joined'" class="btn block" type="button" style="margin-top:8px" @click="$router.push('/m/after/' + s.id)">完成活动 / 评选</button>
        </template>
        <template v-else>
          <p v-if="s.myEnrollment.status === 'applied'">已报名，待确认出行名单。{{ s.oversub?.copy }}</p>
          <p v-else>1. 座位图可改座，早报名早选座。</p>
          <p>2. 本团微信群</p>
          <img v-if="s.consultGroupQr" :src="s.consultGroupQr" alt="本团群二维码" style="width:140px;height:140px;background:#fff;border-radius:12px" />
          <p class="muted">{{ s.consultGroup || contacts.officialWechat }}</p>
          <p>3. 候选团（本团未成团则按顺序转团，价格多退少补）</p>
          <label class="check-row" v-for="opt in candidateOptions" :key="opt.id">
            <input type="checkbox" :value="opt.id" v-model="fallbackIds" />
            <span>{{ opt.title }} {{ opt.startDate }} · 余 {{ opt.remain }}</span>
          </label>
          <p>4. 替代团</p>
          <label class="check-row">
            <input type="checkbox" v-model="autoAlt" />
            <span>如本团未成团，自动加入相同行程的其他日期</span>
          </label>
          <button class="btn ghost block" style="margin-top:8px" :disabled="savingFallbacks" @click="saveFallbacks">保存备选</button>
          <button v-if="s.myEnrollment.status === 'joined'" class="btn block" type="button" style="margin-top:8px" @click="$router.push('/m/after/' + s.id)">完成活动 / 评选</button>
        </template>
      </div></div>

      <template v-if="!isActivity">
        <div class="h2">推荐报名</div>
        <div class="card"><div class="pad" style="text-align:center">
          <p class="muted">推荐成功后按人数结算报名费的 5%</p>
          <img v-if="referral.qr" :src="referral.qr" alt="推荐二维码" style="width:160px;height:160px;background:#fff;border-radius:12px" />
          <p class="muted" style="word-break:break-all">{{ referral.url }}</p>
          <p v-if="referral.code">我的推荐码 {{ referral.code }} · 待结 ¥{{ referral.pending || 0 }} / 已结 ¥{{ referral.earned || 0 }}</p>
          <button class="btn ghost" @click="loadReferral">生成我的推荐码</button>
        </div></div>
      </template>

      <div class="h2" v-if="s.combo?.enabled">组合团 · 另一半条件</div>
      <div class="card" v-if="s.combo?.enabled"><div class="pad">
        <p class="muted">只对学生或已认证学生组织开放。每人写下希望另一半满足的条件。</p>
        <p v-if="s.combo.rule?.school" class="muted">开团要求：{{ s.combo.rule.school }}</p>
        <div v-for="(m, i) in s.combo.mates" :key="i" class="chain-item">
          <span>{{ m.name }}</span>
          <span class="muted">{{ m.school }} · 希望{{ m.wantGender === "female" ? "女生" : m.wantGender === "male" ? "男生" : "不限" }}<template v-if="m.wantSchool"> · {{ m.wantSchool }}</template></span>
          <span v-if="m.note">{{ m.note }}</span>
        </div>
        <p v-if="!s.combo.mates?.length" class="muted">还没有人写下条件。</p>
      </div></div>

      <div class="h2">报名名单</div>
      <div class="card"><div class="pad">
        <div class="chain-item" v-for="c in s.chain" :key="c.index">
          <span>{{ c.index }}</span>
          <span>
            <a v-if="c.userId" class="nav-link" href="#" @click.prevent="goUser(c.userId)">{{ c.name }}</a>
            <span v-else>{{ c.name }}</span>
            {{ c.gender === "female" ? "女" : c.gender === "male" ? "男" : "" }}
            <span v-if="!isActivity && c.lifeStage" class="muted"> · {{ c.lifeStage }}</span>
          </span>
          <span v-if="c.waitlisted" class="muted">候补</span>
          <span v-else-if="c.applied || c.status === 'applied'" class="muted">待确认</span>
          <span
            v-else-if="!isActivity || !isFree"
            :class="{ 'pay-paid': c.payStatus === 'paid', 'pay-unpaid': c.canPay }"
            @click="c.canPay && payFor(c)"
          >{{ (c.seatNo ? c.seatNo + " · " : "") + payText(c.payStatus) }}{{ c.canPay ? " · 去支付" : "" }}</span>
        </div>
        <p class="muted" v-if="!s.chain?.length">还没有人报名，快来占第一名。</p>
      </div></div>

      <div class="h2" v-if="s.lotteryEnabled">本团抽奖</div>
      <div class="card" v-if="s.lotteryEnabled" @click="$router.push('/m/lottery?scheduleId=' + s.id)">
        <div class="pad row">
          <div>
            <strong>{{ s.lotteryLabel || "转盘抽奖" }}</strong>
            <p class="muted" style="margin:4px 0 0">中奖先记账，跟团结束后领奖</p>
          </div>
          <span class="nav-link">去抽 ›</span>
        </div>
      </div>

      <div class="h2">本团评价 <span v-if="reviews.count" class="muted">{{ reviews.avg }} 分 · {{ reviews.count }} 条</span></div>
      <div class="card" v-if="reviews.list?.length">
        <div class="pad review-item" v-for="rv in reviews.list" :key="rv.id">
          <div class="row">
            <strong>{{ rv.name }}</strong>
            <span class="stars">{{ starText(rv.rating) }}</span>
          </div>
          <p v-if="rv.content">{{ rv.content }}</p>
          <p class="muted">{{ rv.createdAt }}</p>
        </div>
      </div>
      <p class="muted" v-else>还没有评价。</p>

      <div v-if="!isActivity" style="display:flex;gap:8px;margin:12px 0">
        <button class="btn ghost" style="flex:1" @click="$router.push('/m/stats/' + s.id)">本团画像</button>
        <button class="btn ghost" style="flex:1" @click="share">分享到微信</button>
      </div>
      <div v-else style="margin:12px 0">
        <button class="btn ghost block" @click="share">分享到微信</button>
      </div>
    </div>

    <div v-show="tab === 'route'" class="trip-pane">
      <RouteProfile
        embedded
        :route="routeDetail || s.route"
        :reviews="routeReviews"
        @fav="favRoute"
      />
    </div>

    <div v-show="tab === 'rules'" class="trip-pane">
      <div class="h2">退改说明</div>
      <div class="card rules-block"><div class="pad">
        <p class="muted" style="margin-top:0">{{ isActivity ? "出发日前可取消；当天不可取消。" : cancelPolicy.summary }}</p>
        <p v-if="!isActivity" v-for="(it, i) in cancelPolicy.items" :key="i" class="muted">{{ i + 1 }}. {{ it }}</p>
      </div></div>

      <template v-if="commonRules.sections?.length">
        <div class="h2">{{ commonRules.title || "公共规则" }}</div>
        <div class="card rules-block"><div class="pad">
          <p class="muted" style="margin-top:0">{{ commonRules.summary }}</p>
          <div v-for="sec in commonRules.sections" :key="sec.title" class="faq-item">
            <strong>{{ sec.title }}</strong>
            <p v-for="(info, i) in sec.items" :key="i" class="muted">{{ info }}</p>
          </div>
        </div></div>
      </template>

      <div class="h2" v-if="waiverText">风险告知</div>
      <div class="card rules-block" v-if="waiverText"><div class="pad">
        <p class="muted waiver-text" style="margin-top:0">{{ waiverText }}</p>
      </div></div>

      <div class="h2" v-if="faqs.length">常见问题</div>
      <div class="card rules-block" v-if="faqs.length"><div class="pad">
        <div class="faq-item" v-for="f in faqs" :key="f.q">
          <strong>{{ f.q }}</strong>
          <p class="muted">{{ f.a }}</p>
        </div>
      </div></div>

      <div class="h2">联系官方与本团</div>
      <div class="card"><div class="pad">
        <div class="contact-row">
          <span>官方微信 {{ contacts.officialWechatName }} <em class="muted">{{ contacts.officialWechat }}</em></span>
          <a class="nav-link" href="#" @click.prevent="copyText(contacts.officialWechat)">复制</a>
        </div>
        <div class="contact-row">
          <span>官方用户群 {{ contacts.officialGroup }}</span>
          <a class="nav-link" href="#" @click.prevent="copyText(contacts.officialWechat)">复制微信号</a>
        </div>
        <div class="contact-row" v-if="s.consultGroup">
          <span>本团咨询群 {{ s.consultGroup }}</span>
          <a class="nav-link" href="#" @click.prevent="copyText(s.consultGroup)">复制</a>
        </div>
        <p class="muted" v-else>本团咨询群确认后会显示在这里。</p>
        <p class="muted">{{ contacts.hint }}</p>
      </div></div>
    </div>

    <div class="enroll-dock">
      <div v-if="showEnroll" class="enroll-bar">
        <div class="enroll-price">
          <b>{{ priceDock.main }}</b>
          <small v-if="priceDock.sub">{{ priceDock.sub }}</small>
        </div>
        <button class="btn" type="button" @click="$router.push(enrollHref)">{{ ctaText }}</button>
      </div>
      <p v-else-if="s.myEnrollment" class="muted" style="text-align:center;margin:0 0 8px">{{ ticket?.title || "已报名" }}<template v-if="isActivity && s.myEnrollment.status !== 'waitlist'">，到场找发起人即可</template></p>
      <button v-if="isOwner && s.organizerType === 'company' && s.status !== 'cancelled'" class="btn block" style="margin-top:8px" @click="settle">公司统一微信支付</button>
      <button v-if="s.isOrganizer && s.status !== 'cancelled'" class="btn ghost block" style="margin-top:8px;color:var(--clay)" @click="showDissolve = true">解散拼团</button>
      <p v-if="msg" class="muted">{{ msg }}</p>
    </div>

    <div v-if="showShare" class="lightbox share-sheet" @click.self="closeShare">
      <div class="share-card" @click.stop>
        <p class="share-title">发给微信好友或群</p>
        <p class="muted">扫码即可打开本团报名页</p>
        <img v-if="shareQr" class="share-qr" :src="shareQr" alt="报名二维码" />
        <p v-else class="muted">正在生成二维码…</p>
        <p class="muted share-url">{{ shareUrl }}</p>
        <p v-if="shareHint" class="share-hint">{{ shareHint }}</p>
        <div class="share-actions">
          <button class="btn ghost" type="button" @click="closeShare">关闭</button>
          <button v-if="nativeShareOk" class="btn ghost" type="button" @click="nativeShare">系统分享</button>
          <button class="btn" type="button" @click="copyShare">复制链接</button>
        </div>
      </div>
    </div>

    <div v-if="showDissolve" class="card" style="margin:12px 14px 0">
      <div class="pad">
        <p>解散后将取消全部报名，已付款的标记退款，并向出行人发送取消短信。</p>
        <label>解散理由</label>
        <textarea class="input" v-model="reason" rows="3" placeholder="例如：天气预警、人数不足不成团" />
        <p v-if="dissolveErr" style="color:var(--clay)">{{ dissolveErr }}</p>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn ghost" style="flex:1" @click="showDissolve = false">取消</button>
          <button class="btn clay" style="flex:1" :disabled="dissolving" @click="dissolve">确认解散</button>
        </div>
      </div>
    </div>

    <div v-if="showBus" class="lightbox" @click.self="showBus = false">
      <img :src="busPhotos[busPhotoIndex]" alt="用车照片" @click.stop="busPhotoIndex = (busPhotoIndex + 1) % busPhotos.length" />
      <div class="lb-nav">
        <button class="lb-btn" type="button" @click.stop="showBus = false">关闭</button>
      </div>
      <div class="lb-hint">{{ busText }} · 点击图片可切换</div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { useUserStore } from "@/stores/user";
import { payStatusText, scheduleStatusText, starText } from "@/utils/labels";
import { formatActivityDate, activityKindOf } from "@/utils/activityKind";
import { canShowEnroll, dockPrice, enrollCta, peopleLine, ticketState, trustChips } from "@/utils/scanFacts";
import { nativeShareSupported, scheduleShareText, scheduleShareUrl } from "@/utils/share";
import { setChrome } from "@/utils/pageChrome";
import WeatherChart from "@/components/WeatherChart.vue";
import TripPrices from "@/components/TripPrices.vue";
import GoodsTabs from "@/components/GoodsTabs.vue";
import RouteProfile from "@/components/RouteProfile.vue";

const TAB_IDS = ["trip", "route", "rules"];
const route = useRoute();
const router = useRouter();
const store = useUserStore();
const s = ref(null);
const tab = ref(normalizeTab(route.query.tab));
const isActivity = computed(() => s.value?.channel === "activity");
const isFree = computed(() => {
  const q = s.value?.quote || {};
  return Number(q.price || 0) === 0 && Number(q.originPrice || 0) === 0 && Number(q.tripPrice || 0) === 0;
});
const whenLabel = computed(() => {
  const d = formatActivityDate(s.value?.startDate);
  return [d.month + d.day + "日", d.weekday].filter(Boolean).join(" ");
});
const whenText = computed(() => {
  if (!s.value) return "";
  if (isActivity.value) return [whenLabel.value, s.value.meetupTime].filter(Boolean).join(" ");
  const end = s.value.endDate && s.value.endDate !== s.value.startDate ? " 至 " + s.value.endDate : "";
  return [s.value.startDate + end, s.value.meetupTime].filter(Boolean).join(" ");
});
const peopleText = computed(() => peopleLine(s.value));
const placeText = computed(() => {
  if (!s.value) return "";
  if (isActivity.value) return s.value.meetupPoint || "";
  return [s.value.meetupPoint, s.value.meetupTime].filter(Boolean).join(" ");
});
const trusts = computed(() => trustChips(s.value));
const ticket = computed(() => ticketState(s.value, route.query));
const priceDock = computed(() => dockPrice(s.value));
const showEnroll = computed(() => canShowEnroll(s.value));
const ctaText = computed(() => enrollCta(s.value));
const kindTag = computed(() => activityKindOf(s.value)?.label || "");
const tabItems = computed(() => [
  { id: "trip", label: isActivity.value ? "本局" : "本团" },
  { id: "route", label: "线路" },
  { id: "rules", label: "须知" },
]);
const msg = ref("");
const leaderNeedApply = ref(false);
const leaderNeedApplyText = ref("报名领队需先填写领队申请并通过审核");
const leaderNeedApplyCta = computed(() => (store.profile?.leaderStatus === "pending" ? "查看领队申请" : "去填写领队申请"));
const showDissolve = ref(false);
const showShare = ref(false);
const showBus = ref(false);
const shareUrl = ref("");
const shareQr = ref("");
const shareText = ref("");
const shareHint = ref("");
const nativeShareOk = computed(() => nativeShareSupported(typeof navigator === "undefined" ? {} : navigator));
const reason = ref("");
const dissolveErr = ref("");
const dissolving = ref(false);
const weather = ref(null);
const reviews = ref({ list: [], count: 0, avg: 0 });
const routeDetail = ref(null);
const routeReviews = ref({ list: [], count: 0, avg: 0 });
const cancelPolicy = ref({ summary: "", items: [] });
const commonRules = ref({ title: "", summary: "", sections: [] });
const waiverText = ref("");
const faqs = ref([]);
const contacts = ref({ officialWechat: "同行者众", officialWechatName: "同行者众官方", officialGroup: "同行者众户外交流群", hint: "" });
const referral = ref({});
const fallbackIds = ref([]);
const autoAlt = ref(false);
const savingFallbacks = ref(false);
const seatChart = ref(null);
const heroIndex = ref(0);
const busPhotoIndex = ref(0);
let heroTimer = 0;
const gallery = computed(() => s.value?.gallery?.length ? s.value.gallery : (s.value?.route?.cover ? [s.value.route.cover] : []));
const enrollHref = computed(() => {
  const q = new URLSearchParams();
  if (route.query.ref) q.set("ref", String(route.query.ref));
  if (route.query.coupon) q.set("coupon", String(route.query.coupon));
  const s = q.toString();
  return "/m/enroll/" + (route.params.id || "") + (s ? "?" + s : "");
});
const photoEnrollHref = computed(() => {
  const q = new URLSearchParams();
  if (route.query.ref) q.set("ref", String(route.query.ref));
  if (route.query.coupon) q.set("coupon", String(route.query.coupon));
  q.set("joinMode", "photographer");
  return "/m/enroll/" + (route.params.id || "") + "?" + q.toString();
});
const busPhotos = computed(() => s.value?.bus?.photos || []);
const busText = computed(() => {
  const b = s.value?.bus;
  if (!b) return "车型待确认";
  const bits = [b.name];
  if (b.seats) bits.push(b.seats + " 座");
  if (b.plateNo) bits.push(b.plateNo);
  else bits.push("车号待确认");
  return bits.join(" · ");
});
const seatRows = computed(() => {
  const list = seatChart.value?.seats || [];
  const groups = [];
  for (const seat of list) {
    const last = groups[groups.length - 1];
    if (!last || last[0].row !== seat.row) groups.push([seat]);
    else last.push(seat);
  }
  return groups;
});
const shownEnrolled = computed(() => {
  if (s.value?.oversub?.pending) return Number(s.value.oversub.applied || 0);
  return Number(s.value?.enrolled || 0);
});
const isOwner = computed(() => store.profile && s.value && Number(s.value.organizerId) === Number(store.profile.id));
const leaderSlots = computed(() => {
  const list = s.value?.leaders || [];
  return [1, 2].map((slot) => ({
    slot,
    label: `领队${slot}`,
    leader: list.find((l) => Number(l.slot) === slot) || null,
  }));
});
const candidateOptions = computed(() => {
  const opts = s.value?.fallbackOptions || {};
  return [...(opts.sameRoute || []), ...(opts.otherRecruiting || [])];
});
const seatHint = computed(() => {
  if (s.value?.myEnrollment?.status === "joined") return isActivity.value ? "点空位即可改位置。" : "点空位即可改座。占用位显示性别与年龄段。";
  if (s.value?.myEnrollment?.status === "applied" || s.value?.oversub?.pending) return "确认出行名单前先不选座。";
  if (isActivity.value) return "点格子看谁来了。报名前会提示先报名。";
  return "早报名早选座。报名前点空位会提示先报名；占用位可看个人主页。";
});
const statusTag = computed(() => {
  if (!s.value) return "";
  if (s.value.status === "cancelled") return scheduleStatusText("cancelled");
  if (isActivity.value) return isFree.value ? "免费局" : kindTag.value || "同城局";
  return s.value.organizerType === "company" ? "公司统一支付" : "先报名后付款";
});

watch(tab, (id) => {
  const next = { ...route.query };
  if (id === "trip") delete next.tab;
  else next.tab = id;
  const same = String(route.query.tab || "") === String(next.tab || "");
  if (!same) router.replace({ query: next });
  nextTick(scrollTabsToTop);
});
watch(() => route.query.tab, (value) => {
  const next = normalizeTab(value);
  if (next !== tab.value) tab.value = next;
});

onMounted(() => {
  load();
  heroTimer = window.setInterval(() => {
    if (gallery.value.length > 1) heroIndex.value = (heroIndex.value + 1) % gallery.value.length;
  }, 4000);
});
onUnmounted(() => {
  if (heroTimer) window.clearInterval(heroTimer);
});

function normalizeTab(value) {
  const id = String(value || "");
  return TAB_IDS.includes(id) ? id : "trip";
}

function scrollTabsToTop() {
  const scroller = document.querySelector(".mp-body");
  const bar = document.querySelector(".goods-tabs");
  if (!scroller || !bar) return;
  const top = bar.offsetTop - scroller.offsetTop;
  scroller.scrollTo({ top: Math.max(0, top), behavior: "instant" });
}

async function load() {
  s.value = (await http.get("/schedules/" + route.params.id)).data;
  heroIndex.value = 0;
  fallbackIds.value = (s.value.myEnrollment?.fallbacks || []).map((f) => f.id);
  autoAlt.value = !!s.value.myEnrollment?.autoAlt;
  setChrome(isActivity.value ? "局详情" : "行程详情", isActivity.value ? "时间、地点、还缺几人" : "座位、集合与报名");
  if (!isActivity.value) {
    try {
      seatChart.value = (await http.get("/schedules/" + route.params.id + "/seats")).data;
    } catch {
      seatChart.value = null;
    }
    try {
      const region = [s.value.route?.region, s.value.route?.title].filter(Boolean).join(" ");
      weather.value = (await http.get("/weather", { params: { region, date: s.value.startDate } })).data;
    } catch {
      weather.value = null;
    }
  } else {
    seatChart.value = null;
    weather.value = null;
  }
  try {
    reviews.value = (await http.get("/schedules/" + route.params.id + "/reviews")).data;
  } catch {
    reviews.value = { list: [], count: 0, avg: 0 };
  }
  try {
    const meta = (await http.get("/meta")).data;
    cancelPolicy.value = meta.cancelPolicy || cancelPolicy.value;
    commonRules.value = meta.commonRules || commonRules.value;
    waiverText.value = meta.waiverText || "";
    faqs.value = meta.faqs || [];
    if (meta.contacts) contacts.value = meta.contacts;
  } catch {
    /* ignore */
  }
  if (s.value.routeId) {
    try {
      routeDetail.value = (await http.get("/routes/" + s.value.routeId)).data;
    } catch {
      routeDetail.value = s.value.route;
    }
    try {
      routeReviews.value = (await http.get("/routes/" + s.value.routeId + "/reviews")).data;
    } catch {
      routeReviews.value = { list: [], count: 0, avg: 0 };
    }
  }
}

function payText(st) {
  return payStatusText(st);
}

function genderMark(g) {
  return g === "female" ? "女" : g === "male" ? "男" : "";
}

function goUser(id) {
  if (id) router.push("/m/user/" + id);
}

function onSeat(seat) {
  if (seat.occupant?.userId) {
    goUser(seat.occupant.userId);
    return;
  }
  if (seat.locked || seat.taken) return;
  if (s.value?.myEnrollment?.status === "joined") {
    pickSeat(seat.no);
    return;
  }
  msg.value = isActivity.value ? "请先报名" : "早报名早选座";
}

async function pickSeat(seatNo) {
  try {
    await http.post("/schedules/" + s.value.id + "/seats/pick", { seatNo });
    msg.value = "已选 " + seatNo;
    await load();
  } catch (e) {
    msg.value = e.message;
  }
}

function openLeader(leader) {
  if (leader.kind === "guide") router.push("/m/guide/" + leader.id);
  else if (leader.userId || leader.id) router.push("/m/user/" + (leader.userId || leader.id));
}

function goLeaderApply() {
  const redirect = encodeURIComponent(route.fullPath);
  router.push("/m/leader?redirect=" + redirect);
}

function showLeaderApplyHint(text) {
  leaderNeedApply.value = true;
  leaderNeedApplyText.value = text || "报名领队需先填写领队申请并通过审核";
  msg.value = leaderNeedApplyText.value;
}

async function applyLeader() {
  if (!store.token) {
    router.push("/m/login?redirect=" + encodeURIComponent(route.fullPath));
    return;
  }
  try {
    await store.fetchMe();
  } catch {
    /* 继续用本地资料判断 */
  }
  if (!store.profile?.isLeader) {
    showLeaderApplyHint(
      store.profile?.leaderStatus === "pending"
        ? "领队申请审核中，通过后再报名领队"
        : "报名领队需先填写领队申请并通过审核"
    );
    return;
  }
  try {
    const res = await http.post("/schedules/" + s.value.id + "/leaders/apply", { leadRef: route.query.leadRef });
    leaderNeedApply.value = false;
    msg.value = res.message || "已报名领队";
    await load();
  } catch (e) {
    if (e.code === "need_leader_apply" || e.code === "leader_pending") {
      showLeaderApplyHint(e.message);
      return;
    }
    msg.value = e.message;
  }
}

async function applyPhotographer() {
  if (!store.token) {
    router.push("/m/login?redirect=" + encodeURIComponent(route.fullPath));
    return;
  }
  try {
    const res = await http.post("/schedules/" + s.value.id + "/photographers/apply");
    msg.value = res.message || "已报名摄影师";
    await load();
  } catch (e) {
    if (e.code === "need_photo_enroll") {
      router.push(photoEnrollHref.value);
      return;
    }
    msg.value = e.message;
  }
}

async function saveFallbacks() {
  if (!s.value?.myEnrollment) return;
  savingFallbacks.value = true;
  try {
    await http.post("/enrollments/" + s.value.myEnrollment.id + "/fallbacks", {
      scheduleIds: fallbackIds.value,
      autoAlt: autoAlt.value,
    });
    msg.value = "已保存候选团 / 替代团";
    await load();
  } catch (e) {
    msg.value = e.message;
  } finally {
    savingFallbacks.value = false;
  }
}

async function loadReferral() {
  if (!store.token) {
    router.push("/m/login?redirect=" + encodeURIComponent(route.fullPath));
    return;
  }
  try {
    referral.value = (await http.get("/me/referral", { params: { scheduleId: s.value.id } })).data || {};
  } catch (e) {
    msg.value = e.message;
  }
}

function previewHero() {
  if (gallery.value.length > 1) heroIndex.value = (heroIndex.value + 1) % gallery.value.length;
}

async function favRoute() {
  if (!store.token) {
    router.push("/m/login?redirect=" + encodeURIComponent(route.fullPath));
    return;
  }
  const r = routeDetail.value || s.value?.route;
  if (!r?.id) return;
  try {
    if (r.favored) await http.delete("/favorites/" + r.id);
    else await http.post("/favorites/" + r.id);
    if (routeDetail.value) routeDetail.value = { ...routeDetail.value, favored: !r.favored };
  } catch (e) {
    msg.value = e.message;
  }
}

async function payFor(c) {
  if (!store.token) {
    router.push("/m/login?redirect=" + encodeURIComponent(route.fullPath));
    return;
  }
  try {
    await http.post("/pay/for-enrollment", { enrollmentId: c.enrollmentId });
    msg.value = "已为 " + c.name + " 完成支付（演示）";
    await load();
  } catch (e) {
    msg.value = e.message;
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    msg.value = "已复制";
  } catch {
    msg.value = text;
  }
}

function closeShare() {
  showShare.value = false;
  shareHint.value = "";
}

async function share() {
  const url = scheduleShareUrl(location.origin, s.value.id, s.value.shareToken);
  shareUrl.value = url;
  shareText.value = scheduleShareText({
    organizerName: s.value.organizerName,
    title: s.value.route.title,
    startDate: s.value.startDate,
    enrolled: s.value.enrolled,
    url,
  });
  shareQr.value = "";
  shareHint.value = "";
  showShare.value = true;
  try {
    const res = await http.get(`/schedules/${s.value.id}/poster`);
    shareQr.value = res.data.qr;
  } catch {
    /* 二维码失败时仍可复制链接 */
  }
}

async function nativeShare() {
  if (!nativeShareOk.value) return;
  try {
    await navigator.share({
      title: "同行者众 · " + s.value.route.title,
      text: shareText.value,
      url: shareUrl.value,
    });
  } catch (e) {
    if (e && e.name === "AbortError") return;
    await copyShare();
  }
}

async function copyShare() {
  try {
    await navigator.clipboard.writeText(shareText.value || shareUrl.value);
    shareHint.value = "链接已复制，打开微信发给好友或群即可";
    msg.value = shareHint.value;
  } catch {
    shareHint.value = "请长按上方链接复制";
    msg.value = shareHint.value;
  }
}

async function settle() {
  const res = await http.post("/pay/company-settle", { scheduleId: s.value.id });
  msg.value = `已为 ${res.data.count} 人统一支付，合计 ¥${res.data.total}`;
  await load();
}

async function dissolve() {
  dissolveErr.value = "";
  if (!reason.value.trim()) {
    dissolveErr.value = "请填写解散理由";
    return;
  }
  dissolving.value = true;
  try {
    const res = await http.post(`/schedules/${s.value.id}/dissolve`, { reason: reason.value.trim() });
    showDissolve.value = false;
    msg.value = `已解散，取消 ${res.data.cancelled} 人，退款 ${res.data.refunded} 人，短信 ${res.data.smsCount} 条`;
    await load();
  } catch (e) {
    dissolveErr.value = e.message;
  } finally {
    dissolving.value = false;
  }
}
</script>
