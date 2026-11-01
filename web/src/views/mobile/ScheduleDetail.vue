<template>
  <LoadRow v-if="!pageReady" />
  <p v-else-if="!s" class="muted pad">加载失败</p>
  <div v-else class="trip-detail" :class="{ 'is-activity': isActivity }">
    <div class="card offer-card" style="border-radius:0;margin:0">
      <div class="offer-hero" v-if="!isActivity && gallery.length" @click="previewHero">
        <img :src="gallery[heroIndex]" :alt="s.route.title" />
        <div class="hero-dots" v-if="gallery.length > 1">
          <i v-for="(g, i) in gallery" :key="g" :class="{ on: i === heroIndex }" />
        </div>
      </div>
      <LivePulse
        flush
        scope="schedule"
        :schedule-id="s.id"
        :route-id="s.routeId || s.route?.id"
      />
      <div class="offer-sheet">
        <div v-if="isActivity" class="city-heading"><img v-if="gallery.length" :src="gallery[0]" class="city-cover" :alt="s.route.title" @click="previewHero" /><div v-else class="city-cover city-cover-fallback"><TravelIcon :name="kindInfo?.icon || 'community'" /></div><div class="city-heading-copy"><span class="city-kicker">{{ kindTag || '同城小聚' }} · 兴趣相聚</span><h1 class="offer-title">{{ s.route.title }}</h1><div class="city-price">{{ isFree ? '免费参加' : '¥' + payPrice }}<small v-if="!isFree">/人</small></div></div></div>
        <div v-if="isActivity" class="city-status"><strong>{{ activityPresentation.title }}</strong><p>{{ activityPresentation.hint }}</p></div>
        <div v-if="isActivity && canDissolve" class="city-manage"><span>你是本次活动的发起人</span><button class="btn ghost" type="button" @click="openDissolve">取消活动</button></div>
        <div class="offer-price-row" v-if="!isActivity">
          <div v-if="isActivity && isFree" class="offer-price">免费</div>
          <div v-else>
            <b class="offer-price">¥{{ payPrice }}</b><small>/人</small>
          </div>
          <span class="tag">{{ statusTag }}</span>
        </div>
        <p v-if="tierHint" class="offer-tiers">{{ tierHint }}</p>
        <h1 v-if="!isActivity" class="offer-title">{{ s.route.title }}</h1>
        <p v-if="sellLine" class="offer-sell">{{ sellLine }}</p>
        <div class="tag-row" v-if="!isActivity">
          <TripKind :kind="s.kind" :type="s.organizerType" :channel="s.channel" />
          <span v-if="s.offerLabel" class="offer-chip inline" :style="{ background: s.offerColor }">{{ s.offerLabel }}</span>
          <span v-if="s.private" class="offer-chip inline" style="background:#4c1d95">{{ s.privateLabel || "口令团" }}</span>
          <span class="play-tag sm" v-for="t in s.playTags || s.route.tags || []" :key="t.id || t" :style="{ background: t.color || '#2d6a4f' }">{{ t.name || t }}</span>
        </div>
        <div class="trust-row" v-if="!isActivity && trusts.length">
          <span class="trust-chip" v-for="c in trusts" :key="c">{{ c }}</span>
        </div>
        <button v-if="reviewQuote" class="offer-quote" type="button" @click="jumpReviews">
          <b>{{ reviews.avg }}分</b>
          <span v-if="reviewQuoteVirtual" class="review-virtual">虚拟用户</span>
          <span>“{{ reviewQuote }}”</span>
          <i>{{ reviews.count }}条</i>
        </button>
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
        <div v-if="isActivity && activityInfo.length" class="activity-detail-brief"><div v-for="item in activityInfo.slice(0, 2)" :key="item.label"><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div></div>
        <p v-if="s.guaranteed && !isActivity" class="ok offer-guaranteed">已成团 · 铁定出发</p>
      </div>
    </div>

    <GoodsTabs v-model="tab" :tabs="tabItems" :label="isActivity ? '局详情分段' : '团详情分段'" />

    <div v-show="tab === 'trip'" class="trip-pane">
      <template v-if="highlights.length">
        <div class="h2">这一天的看点</div>
        <div class="card">
          <div class="pad offer-points">
            <p v-for="(line, i) in highlights" :key="i"><b>{{ i + 1 }}</b>{{ line }}</p>
          </div>
        </div>
      </template>

      <template v-if="itinerary.length">
        <div class="h2">这一天</div>
        <div class="card">
          <div class="pad day-line">
            <div class="day-stop" v-for="(it, i) in itinerary" :key="i">
              <b>{{ it.time || "—" }}</b>
              <div>
                <strong>{{ it.title }}</strong>
                <p v-if="it.detail" class="muted">{{ it.detail }}</p>
                <img v-if="it.photo" class="day-photo" :src="it.photo" alt="" @click="dayPhoto = it.photo" />
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-if="feeInclude || feeExclude || equipment">
        <div class="h2">费用</div>
        <div class="fee-split">
          <div class="card" v-if="feeInclude">
            <div class="pad"><strong>包含</strong><p>{{ feeInclude }}</p></div>
          </div>
          <div class="card" v-if="feeExclude">
            <div class="pad"><strong>不含</strong><p>{{ feeExclude }}</p></div>
          </div>
        </div>
        <p v-if="equipment" class="muted fee-gear">装备：{{ equipment }}</p>
      </template>

      <div class="card">
        <div class="pad">
          <div v-if="s.joinCode" class="ticket-card posted">
            <strong>入团口令 {{ s.joinCode }}</strong>
            <p class="muted" style="margin:6px 0 0">把这串口令发给要来的人。列表上会显示「口令团」，没有口令不能报名。</p>
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
          <div v-if="isActivity" class="city-progress-title">参与人数<strong>{{ shownEnrolled }} / {{ s.maxSeats }}</strong></div>
          <div v-if="!isActivity || !activityPresentation.closed" class="progress"><i :style="{ width: Math.min(100, (shownEnrolled / s.maxSeats) * 100) + '%' }"></i></div>
          <div class="row">
            <span v-if="(!isActivity || !activityPresentation.closed) && (s.minGroupSize || s.oversub?.label)" class="muted">{{ isActivity ? "满 " + s.minGroupSize + " 人成局" : "最低成团 " + s.minGroupSize }}<template v-if="s.oversub?.label"> · {{ s.oversub.label }}</template></span>
            <span v-else></span>
          </div>
          <p class="muted" v-if="s.oversub?.enabled">{{ s.oversub.copy }}</p>
          <p class="muted" v-if="s.eligibility?.enabled">{{ s.eligibility.label }}{{ s.eligibility.alumniOk ? " 已认证师生或校友可报" : " 已认证学生可报" }}</p>
          <p class="muted" v-if="s.genderRatio?.on">{{ s.genderRatio.label }}</p>
          <p v-if="s.eligibility?.enabled && !s.eligibility.canEnroll" class="muted" style="color:var(--clay)">
            {{ s.eligibility.reason }}
            <router-link to="/m/student">去校园认证</router-link>
          </p>
          <div v-if="s.isOrganizer && s.status !== 'cancelled' && s.eligibility?.schools?.length" class="expand-campus">
            <p class="muted">当前范围：{{ s.eligibility.label }}。可以再开放学校-学院-专业组合，不能收窄。</p>
            <CampusNamePicker v-model="addSchool" kind="school" title="开放学校" placeholder="学校" />
            <CampusNamePicker
              v-model="addCollege"
              kind="college"
              :school="addSchool"
              :disabled="!addSchool"
              title="开放学院"
              :placeholder="addSchool ? '学院可空，留空则该校各学院可报' : '请先选学校'"
            />
            <CampusNamePicker
              v-model="addMajor"
              kind="major"
              :school="addSchool"
              :college="addCollege"
              :disabled="!addCollege"
              title="开放专业"
              :placeholder="addCollege ? '专业可空' : '请先选学院'"
            />
            <button class="btn ghost block" type="button" :disabled="expanding || !addSchool" @click="expandLimit({ addTargets: [{ school: addSchool, college: addCollege, major: addMajor }] })">开放该组合</button>
            <button v-if="s.eligibility.colleges?.length" class="btn ghost block" type="button" :disabled="expanding" @click="expandLimit({ openAllColleges: true })">已开放学校全部学院可报</button>
          </div>
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
            <p class="role-kicker" v-if="hasOpenRole">本团还有空位</p>
            <template v-for="slot in leaderSlots" :key="slot.slot">
              <div class="leader-slot" v-if="slot.leader">
                <a class="nav-link" href="#" @click.prevent="openLeader(slot.leader)">
                  <img v-if="slot.leader.avatar" class="leader-face" :src="slot.leader.avatar" alt="" />
                  <span v-else class="leader-face">{{ (slot.leader.name || "领").slice(0, 1) }}</span>
                  {{ slot.label }} {{ slot.leader.name }}
                </a>
              </div>
              <button v-else class="role-open" type="button" @click="applyLeader(slot.slot)">
                <span class="role-open-copy">
                  <b>{{ slot.label }} · 报名领队</b>
                  <small>空位，点此带这团</small>
                </span>
                <i>›</i>
              </button>
            </template>
            <div class="leader-slot" v-if="s.photographer">
              <a class="nav-link" href="#" @click.prevent="openLeader(s.photographer)">
                <img v-if="s.photographer.avatar" class="leader-face" :src="s.photographer.avatar" alt="" />
                <span v-else class="leader-face">{{ (s.photographer.name || "摄").slice(0, 1) }}</span>
                摄影师 {{ s.photographer.name }}
              </a>
            </div>
            <button v-else class="role-open" type="button" @click="applyPhotographer">
              <span class="role-open-copy">
                <b>报名摄影师</b>
                <small>空位，免个人团费</small>
              </span>
              <i>›</i>
            </button>
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

      <div class="h2" v-if="s.myEnrollment || (isActivity && s.isOrganizer)">{{ isActivity ? '参与安排' : '报名后' }}</div>
      <div class="card" v-if="s.myEnrollment || (isActivity && s.isOrganizer)"><div class="pad">
        <template v-if="isActivity">
          <div class="city-group"><div class="city-group-heading">本局微信群<span>{{ activityPresentation.closed ? '本次活动的群信息，供已确认参加者查看' : '见面前，先和同好打声招呼' }}</span></div><div v-if="activityGroupQr || s.consultGroup" class="city-group-content"><a v-if="activityGroupQr" :href="activityGroupQr" target="_blank" rel="noopener noreferrer" aria-label="查看本局群二维码"><img :src="activityGroupQr" class="city-group-qr" alt="本局群二维码" @error="groupQrError" /></a><div><p v-if="s.consultGroup">{{ s.consultGroup }}</p><small v-if="activityGroupQr">点击查看，长按识别群二维码</small><small v-if="activityGroupQr">二维码失效时，请联系发起人。</small></div></div><p v-if="activityGroupQrError" class="city-group-empty">群二维码暂时加载失败。<button type="button" class="nav-link" @click="failedGroupQr = ''">重新加载</button></p><p v-else-if="!activityGroupQr && !s.consultGroup" class="city-group-empty">{{ activityGroupEmpty }}</p></div>
          <button v-if="showAfter" class="btn block" type="button" style="margin-top:8px" @click="$router.push('/m/after/' + s.id)">评价 / 评选</button>
          <p v-if="!activityPresentation.closed && s.myEnrollment?.status === 'joined' && s.myEnrollment.payStatus === 'unpaid' && s.myEnrollment.remainAmount > 0">费用待付 ¥{{ s.myEnrollment.remainAmount }}，点下方去支付。</p>
        </template>
        <template v-else>
          <p v-if="s.myEnrollment.status === 'applied'">已报名，待确认出行名单。{{ s.oversub?.copy }}</p>
          <p v-else>1. 座位图可改座，早报名早选座。</p>
          <p>2. 本团微信群</p>
          <img v-if="activityGroupQr" :src="activityGroupQr" alt="本团群二维码" style="width:140px;height:140px;background:#fff;border-radius:12px" @error="groupQrError" />
          <p v-if="s.consultGroup" class="muted">{{ s.consultGroup }}</p>
          <p v-if="activityGroupQrError" class="muted">群二维码暂时加载失败。<button type="button" class="nav-link" @click="failedGroupQr = ''">重新加载</button></p>
          <p v-else-if="!activityGroupQr && !s.consultGroup" class="muted">发起人暂未提供本团群信息，请联系发起人确认。</p>
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
          <p v-if="s.myEnrollment.status === 'joined' && s.myEnrollment.payStatus === 'unpaid' && s.myEnrollment.remainAmount > 0">团费待付 ¥{{ s.myEnrollment.remainAmount }} / ¥{{ s.myEnrollment.payAmount }}，点下方去支付。</p>
          <button v-if="showAfter" class="btn block" type="button" style="margin-top:8px" @click="$router.push('/m/after/' + s.id)">评价 / 评选</button>
        </template>
        <PayHelpers :list="s.myEnrollment?.helpers || []" />
      </div></div>

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
            @click="c.canPay && openPay(c)"
          >{{ rosterPayText(c) }}</span>
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

      <div id="trip-reviews" class="h2">{{ isActivity ? '活动评价' : '本团评价' }} <span v-if="reviews.count" class="muted">{{ reviews.avg }} 分 · {{ reviews.count }} 条</span></div>
      <LoadRow v-if="!reviewsReady && !reviews.list?.length" />
      <div class="card" v-else-if="reviews.list?.length">
        <div class="pad review-item" v-for="rv in reviews.list" :key="rv.id">
          <div class="row">
            <strong>{{ rv.name }}</strong>
            <span v-if="rv.virtual" class="review-virtual">虚拟用户</span>
            <span class="stars">{{ starText(rv.rating) }}</span>
          </div>
          <p v-if="rv.content">{{ rv.content }}</p>
          <p class="muted">{{ rv.createdAt }}</p>
        </div>
      </div>
      <p class="muted" v-else>还没有评价。</p>

      <div v-if="!isActivity" style="margin:12px 0">
        <button class="btn ghost block" type="button" @click="$router.push('/m/stats/' + s.id)">本团画像</button>
      </div>
    </div>

    <div v-show="tab === 'route'" class="trip-pane">
      <LoadRow v-if="!routeDetail && !s.route" />
      <section v-else-if="isActivity" class="activity-description-card"><h2>活动介绍</h2><dl v-if="activityInfo.length"><div v-for="item in activityInfo" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div></dl><p v-if="activityIntro">{{ activityIntro }}</p><p v-else-if="!activityInfo.length">发起人暂未填写更多介绍，请先核对上方时间与地点。</p><p v-if="s.notes" class="muted">{{ s.notes }}</p></section>
      <RouteProfile
        v-else
        embedded
        :route="routeDetail || s.route"
        :reviews="routeReviews"
        :reviews-ready="routeReviewsReady"
        @fav="favRoute"
      />
    </div>

    <div v-show="tab === 'rules'" class="trip-pane">
      <div class="h2">退改说明</div>
      <div class="card rules-block"><div class="pad">
        <p class="muted" style="margin-top:0">{{ isActivity ? "活动开始前可取消；已支付费用按原支付渠道退回。" : refundCopy.summary }}</p>
        <p v-if="!isActivity && refundCopy.current?.hint" class="muted">{{ refundCopy.current.hint }}</p>
        <p v-if="!isActivity" v-for="(it, i) in refundCopy.items" :key="i" class="muted">{{ i + 1 }}. {{ it }}</p>
      </div></div>

      <div v-if="isActivity" class="card city-rules"><div class="pad"><h2>参与须知</h2><p>{{ kindInfo?.notice || '请根据自身情况参加，尊重同行者并遵守现场约定。' }}</p></div></div>
      <template v-if="!isActivity && commonRules.sections?.length">
        <div class="h2">{{ commonRules.title || "公共规则" }}</div>
        <div class="card rules-block"><div class="pad">
          <p class="muted" style="margin-top:0">{{ commonRules.summary }}</p>
          <div v-for="sec in commonRules.sections" :key="sec.title" class="faq-item">
            <strong>{{ sec.title }}</strong>
            <p v-for="(info, i) in sec.items" :key="i" class="muted">{{ info }}</p>
          </div>
        </div></div>
      </template>

      <div class="h2" v-if="!isActivity && waiverText">风险告知</div>
      <div class="card rules-block" v-if="!isActivity && waiverText"><div class="pad">
        <p class="muted waiver-text" style="margin-top:0">{{ waiverText }}</p>
      </div></div>

      <div class="h2" v-if="!isActivity && faqs.length">常见问题</div>
      <div class="card rules-block" v-if="!isActivity && faqs.length"><div class="pad">
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

    <div v-if="dockVisible" class="enroll-dock">
      <div v-if="showEnroll" class="enroll-bar">
        <div class="enroll-price">
          <b>{{ priceDock.main }}</b>
          <small v-if="priceDock.sub">{{ priceDock.sub }}</small>
        </div>
        <button class="btn" type="button" @click="goEnroll">{{ ctaText }}</button>
      </div>
      <div v-else-if="(!isActivity || !activityPresentation.closed) && s.myEnrollment?.status === 'joined' && s.myEnrollment.remainAmount > 0 && s.myEnrollment.payShareToken" class="enroll-bar">
        <div class="enroll-price"><b>待付 ¥{{ s.myEnrollment.remainAmount }}</b></div>
        <button class="btn" type="button" @click="invitePay">去支付</button>
      </div>
      <p v-else-if="isActivity && activityPresentation.closed && !s.myEnrollment" class="muted" style="text-align:center">{{ activityPresentation.title }}</p>
      <p v-else-if="s.myEnrollment && (isActivity || s.myEnrollment.payStatus !== 'paid')" class="muted" style="text-align:center;margin:0 0 8px">{{ isActivity ? activityPresentation.title : (ticket?.title || "已报名") }}</p>
      <button v-if="isOwner && s.organizerType === 'company' && s.status !== 'cancelled'" class="btn block" style="margin-top:8px" @click="settle">公司统一微信支付</button>
      <button v-if="!isActivity && canDissolve" class="btn ghost block" style="margin-top:8px;color:var(--clay)" @click="openDissolve">解散拼团</button>
      <p v-if="msg" class="muted">{{ msg }}</p>
    </div>

    <div v-if="showShare" class="lightbox share-sheet" @click.self="closeShare">
      <div class="share-card" @click.stop>
        <p class="share-title">发给微信好友</p>
        <p class="muted">微信小程序转发是聊天卡片；也可保存详情图，让对方扫码报名。通过你的链接/二维码报名，成团后返点团费 {{ Math.round((sharePoster.rate || 0.05) * 100) }}%。</p>
        <div class="share-poster-preview">
          <img v-if="sharePosterImg" :src="sharePosterImg" alt="行程分享图" />
          <div v-else class="share-poster-fallback">
            <img v-if="shareQr" class="share-qr" :src="shareQr" alt="报名二维码" />
            <p v-else class="muted">正在生成海报…</p>
          </div>
        </div>
        <p class="muted share-url">{{ shareUrl }}</p>
        <p v-if="shareHint" class="share-hint">{{ shareHint }}</p>
        <div class="share-actions">
          <button class="btn ghost" type="button" @click="closeShare">关闭</button>
          <button class="btn ghost" type="button" :disabled="savingPoster" @click="savePoster">保存图片</button>
          <button v-if="nativeShareOk" class="btn ghost" type="button" @click="nativeShare">系统分享</button>
          <button class="btn" type="button" @click="copyShare">复制链接</button>
        </div>
      </div>
    </div>

    <Teleport to="body"><div v-if="showDissolve" class="dissolve-mask" @click.self="closeDissolve" @keydown.esc="closeDissolve">
      <section class="dissolve-dialog" role="dialog" aria-modal="true" aria-labelledby="dissolve-title" tabindex="-1">
        <h2 id="dissolve-title">{{ isActivity ? '取消本次活动' : '解散拼团' }}</h2>
        <p>{{ isActivity ? '取消后将关闭活动报名，已报名者会收到取消消息，已支付费用按原支付渠道退回。' : '解散后将取消全部报名，并按退费规则处理退款。' }}</p>
        <label for="dissolve-reason">{{ isActivity ? '取消原因' : '解散理由' }}</label>
        <textarea id="dissolve-reason" class="input" v-model="reason" rows="3" maxlength="200" :disabled="dissolving" :placeholder="isActivity ? '请填写取消原因' : '请填写解散理由'" />
        <p v-if="dissolveErr" class="dissolve-error" role="alert">{{ dissolveErr }}</p>
        <div class="dissolve-actions"><button class="btn ghost" type="button" :disabled="dissolving" @click="closeDissolve">暂不取消</button><button class="btn" type="button" :disabled="dissolving" @click="dissolve">{{ dissolving ? '正在处理…' : isActivity ? '确认取消活动' : '确认解散' }}</button></div>
      </section>
    </div></Teleport>

    <div v-if="dayPhoto" class="lightbox" @click.self="dayPhoto = ''">
      <img :src="dayPhoto" alt="行程照片" />
      <div class="lb-nav">
        <button class="lb-btn" type="button" @click.stop="dayPhoto = ''">关闭</button>
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
import { formatActivityDate, activityKindOf, activityDetails, activityBody, activityEnded } from "@/utils/activityKind";
import { canShowEnroll, dockPrice, enrollCta, peopleLine, showDetailTabs, ticketState, trustChips } from "@/utils/scanFacts";
import { nativeShareSupported, scheduleShareText, scheduleShareUrl } from "@/utils/share";
import { drawTripPoster, downloadPosterPng, posterDataUrl } from "@/utils/sharePoster";
import { setChrome } from "@/utils/pageChrome";
import WeatherChart from "@/components/WeatherChart.vue";
import PayHelpers from "@/components/PayHelpers.vue";
import GoodsTabs from "@/components/GoodsTabs.vue";
import RouteProfile from "@/components/RouteProfile.vue";
import LoadRow from "@/components/LoadRow.vue";
import LivePulse from "@/components/LivePulse.vue";
import CampusNamePicker from "@/components/CampusNamePicker.vue";
import TripKind from "@/components/TripKind.vue";
import TravelIcon from "@/components/TravelIcon.vue";

const TAB_IDS = ["trip", "route", "rules"];
const route = useRoute();
const router = useRouter();
const store = useUserStore();
const s = ref(null);
const pageReady = ref(false);
const tab = ref(normalizeTab(route.query.tab));
const isActivity = computed(() => s.value?.channel === "activity");
function canDissolveSchedule(row) {
  if (!row) return false;
  if (typeof row.canDissolve === "boolean") return row.canDissolve;
  if (!row.isOrganizer || row.status === "cancelled") return false;
  if (row.channel === "activity" && ["pending", "rejected"].includes(row.reviewStatus) && !row.startedAt && !row.completedAt && !["finished", "completed", "ended"].includes(row.status)) return true;
  return row.channel !== "activity" || !activityEnded(row);
}
const canDissolve = computed(() => canDissolveSchedule(s.value));
const failedGroupQr = ref("");
function uploadedGroupQr(value) {
  const url = String(value || "").trim();
  return /^(?:https?:\/\/[^/?#]+)?\/static\/uploads\/[\w-]+\.(?:png|jpe?g|webp|gif)(?:\?[^#]*)?$/i.test(url) ? url : "";
}
const activityGroupQrError = computed(() => !!failedGroupQr.value && failedGroupQr.value === s.value?.consultGroupQr);
const activityGroupQr = computed(() => activityGroupQrError.value ? "" : uploadedGroupQr(s.value?.consultGroupQr));
function groupQrError() { failedGroupQr.value = s.value?.consultGroupQr || ""; }
const refundCopy = computed(() => s.value?.refundPolicy || cancelPolicy.value);
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
const peopleText = computed(() => isActivity.value && activityPresentation.value.closed ? "已报名 " + Number(s.value?.enrolled || 0) + " 人" : peopleLine(s.value));
const placeText = computed(() => {
  if (!s.value) return "";
  if (isActivity.value) return s.value.meetupPoint || "";
  return [s.value.meetupPoint, s.value.meetupTime].filter(Boolean).join(" ");
});
const trusts = computed(() => trustChips(s.value));
const activityPresentation = computed(() => {
  const row = s.value || {};
  const en = row.myEnrollment;
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const ended = !!row.completedAt || ["finished", "completed", "ended"].includes(row.status) || String(row.endDate || row.startDate || "").slice(0, 10) < today;
  let title = "招募中", hint = "先了解活动安排，再决定是否加入。";
  if (row.status === "cancelled") { title = "活动已取消"; hint = row.cancelReason || "本次活动已取消，请查看报名记录与退款进度。"; }
  else if (row.reviewStatus === "pending") { title = "审核中"; hint = "审核通过后开放报名。"; }
  else if (row.reviewStatus === "rejected") { title = "审核未通过"; hint = "本次活动暂未开放报名。"; }
  else if (ended) { title = "活动已结束"; hint = "本次活动已结束，报名记录为你保留。"; }
  else if (activityEnded(row)) { title = "活动已开始"; hint = "本次活动已开始，报名入口已关闭。"; }
  else if (en?.status === "waitlist") { title = "候补中"; hint = "有人退出时按报名顺序递补，确认后可查看群信息。"; }
  else if (en?.status === "applied") { title = "报名待确认"; hint = "名单确认后可查看本局微信群。"; }
  else if (en?.status === "joined" && Number(en.remainAmount) > 0) { title = "待付款"; hint = "请完成剩余费用支付，支付确认后可查看群信息。"; }
  else if (en?.status === "joined") { title = "已报名"; hint = "请核对见面时间与地点，按约定准时参加。"; }
  else if (Number(row.remain) <= 0) { title = "已满员"; hint = "可报名候补，等待空位递补。"; }
  return { title, hint, ended, closed: ended || activityEnded(row) || row.status === "cancelled" };
});
const activityGroupEmpty = computed(() => {
  const row = s.value || {};
  const en = row.myEnrollment;
  if (!row.isOrganizer && (en?.status !== "joined" || Number(en.remainAmount) > 0)) {
    return activityPresentation.value.closed ? "本次活动已关闭，群信息仅向已确认参加者开放。" : "确认参加并完成支付后可查看群信息。";
  }
  return activityPresentation.value.closed ? "发起人未提供本次活动的群信息。" : "发起人暂未提供群信息，请按活动安排到场。";
});
const ticket = computed(() => {
  const base = ticketState(s.value, isActivity.value ? { posted: route.query.posted } : route.query);
  if (!isActivity.value || (!s.value?.myEnrollment && !base)) return base;
  return { ...(base || {}), kind: "activity", title: activityPresentation.value.title, sub: activityPresentation.value.hint, trips: !!s.value.myEnrollment, share: !activityPresentation.value.closed };
});
const priceDock = computed(() => dockPrice(s.value));
const showEnroll = computed(() => canShowEnroll(s.value) && !s.value?.completedAt && !["finished", "completed", "ended"].includes(s.value?.status));
const showAfter = computed(() => !!(s.value?.completedAt && s.value?.myEnrollment?.status === "joined"));
const ctaText = computed(() => enrollCta(s.value));
const kindInfo = computed(() => activityKindOf(s.value));
const kindTag = computed(() => kindInfo.value?.label || "");
const tabItems = computed(() => [
  { id: "trip", label: isActivity.value ? "本局" : "本团" },
  { id: "route", label: isActivity.value ? "活动介绍" : "线路" },
  { id: "rules", label: "须知" },
]);
const activityInfo = computed(() => activityDetails(s.value));
const activityIntro = computed(() => activityBody(s.value));
const activityIsOver = computed(() => isActivity.value && activityEnded(s.value));
const storyRoute = computed(() => isActivity.value ? {} : routeDetail.value || s.value?.route || {});
const sellLine = computed(() => {
  const route = storyRoute.value;
  return route.subtitle || (route.highlights || [])[0] || "";
});
const highlights = computed(() => {
  const all = (storyRoute.value.highlights || []).filter((line) => typeof line === "string" && line.trim());
  const sell = sellLine.value;
  return all.filter((line) => line !== sell).slice(0, 3);
});
const itinerary = computed(() => storyRoute.value.itinerary || []);
const feeInclude = computed(() => storyRoute.value.feeInclude || "");
const feeExclude = computed(() => storyRoute.value.feeExclude || "");
const equipment = computed(() => storyRoute.value.equipment || "");
const payPrice = computed(() => {
  const q = s.value?.quote || {};
  return Number(q.price ?? q.tripPrice ?? q.originPrice ?? 0);
});
const tierHint = computed(() => {
  if (!s.value || isActivity.value || isFree.value) return "";
  const q = s.value.quote || {};
  const pay = payPrice.value;
  const bits = [];
  const origin = Number(q.originPrice ?? 0);
  if (origin > pay) bits.push("原价 ¥" + origin);
  const member = Number(q.memberPrice ?? pay);
  const student = Number(q.studentPrice ?? pay);
  if (member < pay) bits.push("会员 ¥" + member);
  if (student < pay && student !== member) bits.push("学生 ¥" + student);
  return bits.join(" · ");
});
const reviewQuote = computed(() => {
  const text = String(reviews.value.list?.[0]?.content || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > 18 ? text.slice(0, 18) + "…" : text;
});
const reviewQuoteVirtual = computed(() => !!reviews.value.list?.[0]?.virtual);
const msg = ref("");
const leaderNeedApply = ref(false);
const leaderNeedApplyText = ref("报名领队需先填写领队申请并通过审核");
const leaderNeedApplyCta = computed(() => (store.profile?.leaderStatus === "pending" ? "查看领队申请" : "去填写领队申请"));
const showDissolve = ref(false);
const showShare = ref(false);
const showBus = ref(false);
const dayPhoto = ref("");
const shareUrl = ref("");
const shareQr = ref("");
const shareText = ref("");
const shareHint = ref("");
const sharePoster = ref({});
const sharePosterImg = ref("");
const savingPoster = ref(false);
const nativeShareOk = computed(() => nativeShareSupported(typeof navigator === "undefined" ? {} : navigator));
const reason = ref("");
const dissolveErr = ref("");
const dissolving = ref(false);
const addCollege = ref("");
const addSchool = ref("");
const addMajor = ref("");
watch(addSchool, (next, prev) => {
  if (prev && next !== prev) {
    addCollege.value = "";
    addMajor.value = "";
  }
});
watch(addCollege, (next, prev) => {
  if (prev && next !== prev) addMajor.value = "";
});
const expanding = ref(false);
const weather = ref(null);
const reviews = ref({ list: [], count: 0, avg: 0 });
const reviewsReady = ref(false);
const routeDetail = ref(null);
const routeReviews = ref({ list: [], count: 0, avg: 0 });
const routeReviewsReady = ref(false);
const cancelPolicy = ref({ summary: "", items: [] });
const commonRules = ref({ title: "", summary: "", sections: [] });
const waiverText = ref("");
const faqs = ref([]);
const contacts = ref({ officialWechat: "同行者众", officialWechatName: "同行者众官方", officialGroup: "同行者众户外交流群", hint: "" });
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
  const code = route.query.joinCode || route.query.code;
  if (code) q.set("joinCode", String(code));
  const s = q.toString();
  return "/m/enroll/" + (route.params.id || "") + (s ? "?" + s : "");
});
function goEnroll() {
  const row = s.value;
  if (!canShowEnroll(row) || row.completedAt || ["finished", "completed", "ended"].includes(row.status)) {
    msg.value = row?.channel === "activity" && activityEnded(row) ? "本次活动已关闭报名" : "本次行程暂不可报名";
    load();
    return;
  }
  router.push(enrollHref.value);
}
const photoEnrollHref = computed(() => {
  const q = new URLSearchParams();
  if (route.query.ref) q.set("ref", String(route.query.ref));
  if (route.query.coupon) q.set("coupon", String(route.query.coupon));
  const code = route.query.joinCode || route.query.code;
  if (code) q.set("joinCode", String(code));
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
const dockVisible = computed(() => {
  if (!s.value) return false;
  if (isActivity.value && activityPresentation.value.closed) return false;
  if (!showDetailTabs(s.value)) return true;
  if (s.value.isOrganizer && s.value.status !== "cancelled") return true;
  if (isOwner.value && s.value.organizerType === "company" && s.value.status !== "cancelled") return true;
  return !!msg.value;
});
const leaderSlots = computed(() => {
  const list = s.value?.leaders || [];
  return [1, 2].map((slot) => ({
    slot,
    label: `领队${slot}`,
    leader: list.find((l) => Number(l.slot) === slot) || null,
  }));
});
const hasOpenRole = computed(() => leaderSlots.value.some((slot) => !slot.leader) || !s.value?.photographer);
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
  if (isActivity.value) return activityPresentation.value.title;
  if (s.value.guaranteed || s.value.status === "confirmed") return "已成团";
  return scheduleStatusText(s.value.status) || "招募中";
});

function jumpReviews() {
  tab.value = "trip";
  nextTick(() => document.getElementById("trip-reviews")?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

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
  reviewsReady.value = false;
  routeReviewsReady.value = false;
  try {
    if (store.token) await store.fetchMe().catch(() => {});
    s.value = (await http.get("/schedules/" + route.params.id)).data;
  } catch {
    pageReady.value = true;
    return;
  }
  pageReady.value = true;
  heroIndex.value = 0;
  fallbackIds.value = (s.value.myEnrollment?.fallbacks || []).map((f) => f.id);
  autoAlt.value = !!s.value.myEnrollment?.autoAlt;
  setChrome(isActivity.value ? "局详情" : "行程详情", isActivity.value ? "时间、地点与参与安排" : "座位、集合与报名");
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
  } finally {
    reviewsReady.value = true;
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
  if (s.value.routeId && !isActivity.value) {
    try {
      routeDetail.value = (await http.get("/routes/" + s.value.routeId)).data;
    } catch {
      routeDetail.value = s.value.route;
    }
    try {
      routeReviews.value = (await http.get("/routes/" + s.value.routeId + "/reviews")).data;
    } catch {
      routeReviews.value = { list: [], count: 0, avg: 0 };
    } finally {
      routeReviewsReady.value = true;
    }
  } else {
    routeReviewsReady.value = true;
  }
}

function payText(st) {
  return payStatusText(st);
}

function rosterPayText(c) {
  const seat = c.seatNo ? c.seatNo + " · " : "";
  if (c.canPay && c.paidAmount > 0) return `${seat}已付 ¥${c.paidAmount} / ¥${c.payAmount} · 去支付`;
  if (c.canPay) return `${seat}${payStatusText(c.payStatus)} · 去支付`;
  return seat + payStatusText(c.payStatus);
}

function openPay(row) {
  if (row?.payShareToken) router.push("/m/pay/" + row.payShareToken);
  else msg.value = "暂时无法打开支付";
}

function invitePay() {
  const token = s.value?.myEnrollment?.payShareToken;
  if (!token) {
    msg.value = "暂时无法生成付款分享";
    return;
  }
  router.push("/m/pay/" + token);
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
  const inboundRef = String(route.query.ref || "").trim();
  const url = scheduleShareUrl(location.origin, s.value.id, s.value.shareToken, s.value.joinCode, inboundRef);
  shareUrl.value = url;
  shareText.value = scheduleShareText({
    organizerName: s.value.organizerName,
    title: s.value.route.title,
    startDate: s.value.startDate,
    enrolled: s.value.enrolled,
    url,
    joinCode: s.value.joinCode,
  });
  shareQr.value = "";
  shareHint.value = "";
  sharePoster.value = {};
  sharePosterImg.value = "";
  showShare.value = true;
  try {
    const res = await http.get(`/schedules/${s.value.id}/poster`);
    sharePoster.value = res.data || {};
    shareQr.value = res.data.qr;
    shareUrl.value = scheduleShareUrl(
      location.origin,
      s.value.id,
      s.value.shareToken,
      s.value.joinCode,
      res.data.referralCode || inboundRef
    );
    sharePosterImg.value = posterDataUrl(res.data.posterSvg);
    shareText.value = scheduleShareText({
      organizerName: s.value.organizerName,
      title: s.value.route.title,
      startDate: s.value.startDate,
      enrolled: s.value.enrolled,
      url: shareUrl.value,
      joinCode: s.value.joinCode,
    });
  } catch {
    /* 二维码失败时仍可复制链接 */
  }
}

async function savePoster() {
  savingPoster.value = true;
  try {
    const canvas = await drawTripPoster(sharePoster.value.facts || {
      title: s.value.route?.title,
      cover: gallery.value[0],
      kindLabel: s.value.kindLabel,
      originPrice: s.value.quote?.originPrice,
      memberPrice: s.value.quote?.memberPrice,
      studentPrice: s.value.quote?.studentPrice,
      price: s.value.quote?.price,
      startDate: s.value.startDate,
      meetupTime: s.value.meetupTime,
      meetupPoint: s.value.meetupPoint,
      enrolled: s.value.enrolled,
      maxSeats: s.value.maxSeats,
      minGroup: s.value.minGroupSize,
      organizerName: s.value.organizerName,
      rate: sharePoster.value.rate,
    }, shareQr.value);
    await downloadPosterPng(canvas, `${s.value.route?.title || "行程"}-报名.png`);
    shareHint.value = "已开始下载分享图";
  } catch {
    shareHint.value = "浏览器限制保存时，请长按上方图片另存";
  } finally {
    savingPoster.value = false;
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
  if (res.data.needPay) {
    msg.value = "请打开微信小程序完成公司统一支付，支付成功后才会记为已付";
    return;
  }
  msg.value = `已为 ${res.data.count} 人统一支付，合计 ¥${res.data.total}`;
  await load();
}

async function expandLimit(body) {
  expanding.value = true;
  try {
    const res = await http.put("/schedules/" + s.value.id + "/limit", body);
    s.value = res.data;
    addCollege.value = "";
    addSchool.value = "";
    addMajor.value = "";
    msg.value = "已开放报名范围：" + (res.data.eligibility?.label || "");
  } catch (e) {
    msg.value = e.message;
  } finally {
    expanding.value = false;
  }
}

async function dissolve() {
  if (dissolving.value) return;
  if (!canDissolveSchedule(s.value)) { showDissolve.value = false; await load(); return; }
  dissolveErr.value = "";
  if (!reason.value.trim()) {
    dissolveErr.value = isActivity.value ? "请填写取消原因" : "请填写解散理由";
    return;
  }
  dissolving.value = true;
  try {
    const res = await http.post(`/schedules/${s.value.id}/dissolve`, { reason: reason.value.trim() });
    showDissolve.value = false;
    msg.value = `${isActivity.value ? '活动已取消' : '已解散'}，已取消 ${Number(res.data.cancelled || 0)} 人的报名` + (Number(res.data.refunded) > 0 ? `，已为 ${res.data.refunded} 人处理退款，请留意原支付渠道。` : '。');
    await load();
  } catch (e) {
    dissolveErr.value = e.message;
  } finally {
    dissolving.value = false;
  }
}
function openDissolve() {
  if (!canDissolveSchedule(s.value)) { load(); return; }
  dissolveErr.value = "";
  showDissolve.value = true;
  nextTick(() => document.querySelector('.dissolve-dialog')?.focus());
}
function closeDissolve() { if (!dissolving.value) showDissolve.value = false; }
</script>


<style scoped>
.activity-detail-brief { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:15px 18px; border:1px solid var(--line); border-radius:14px; background:var(--bg); padding:16px; margin:18px 0 6px; }
.activity-detail-brief > div { min-width:0; display:flex; flex-direction:column; gap:5px; line-height:1.7; }
.activity-detail-brief span { color:var(--muted); font-size:calc(10px * var(--ui-scale,1)); }
.activity-detail-brief strong { color:var(--ink); font-size:calc(12px * var(--ui-scale,1)); font-weight:500; overflow-wrap:anywhere; background:transparent; }
.activity-description-card { border-radius:16px; background:var(--card,#fff); padding:22px; }
.activity-description-card h2 { font-size:calc(18px * var(--ui-scale,1)); color:var(--ink); font-weight:600; margin:0 0 20px; }
.activity-description-card dl { margin:0 0 22px; }
.activity-description-card dl > div { display:grid; grid-template-columns:85px minmax(0,1fr); gap:12px; padding:12px 0; border-bottom:1px solid var(--line); line-height:1.8; font-size:calc(12px * var(--ui-scale,1)); }
.activity-description-card dt { color:var(--muted); }
.activity-description-card dd { margin:0; color:var(--ink); overflow-wrap:anywhere; }
.activity-description-card > p { font-size:calc(13px * var(--ui-scale,1)); color:var(--ink); line-height:1.9; white-space:pre-wrap; }

.trip-detail.is-activity { --city-purple:var(--pine,#5b3b8c); --city-soft:var(--soft,#f4eff9); padding-top:12px; color:var(--ink); }
.is-activity .offer-card { margin:0 14px 14px !important; border-radius:20px !important; border:1px solid var(--line); box-shadow:none; background:var(--card,#fff); }
.is-activity .offer-sheet { padding:18px; }
.city-heading { display:flex; align-items:center; gap:15px; padding-bottom:17px; }
.city-cover { width:88px; height:88px; flex:none; object-fit:cover; border-radius:15px; background:var(--city-soft); }
.city-cover-fallback { display:grid; place-items:center; color:var(--city-purple); }
.city-cover-fallback :deep(svg) { width:40px; height:40px; stroke-width:1.35; }
.city-heading-copy { flex:1; min-width:0; }
.city-kicker { color:var(--muted); font-size:10px; letter-spacing:1.5px; }
.is-activity .city-heading .offer-title { font-size:calc(21px * var(--ui-scale,1)); margin:8px 0 9px; font-weight:650; line-height:1.5; color:var(--ink); overflow-wrap:anywhere; }
.city-price { color:var(--city-purple); font-size:17px; font-weight:650; }
.city-price small { margin-left:4px; font-size:11px; font-weight:400; }
.city-status { border-top:1px solid var(--line); padding:15px 0 8px; }
.city-status strong { display:inline-block; font-size:12px; color:var(--city-purple); background:var(--city-soft); padding:5px 11px; border-radius:7px; }
.city-status p { margin:8px 0; color:var(--muted); font-size:12px; line-height:1.8; }
.city-manage { display:flex; align-items:center; justify-content:space-between; gap:12px; padding-top:14px; border-top:1px solid var(--line); font-size:11px; color:var(--muted); }
.is-activity .city-manage .btn { flex:none; margin:0; padding:7px 13px; font-size:12px; }
.is-activity .fact-list { margin-top:0; }
.is-activity .fact-row { gap:12px; margin:0; padding:8px 0; align-items:flex-start; font-size:13px; line-height:1.75; }
.is-activity .fact-k { flex:none; width:31px; color:var(--muted); font-weight:400; }
.is-activity .fact-v { color:var(--ink); font-weight:500; min-width:0; overflow-wrap:anywhere; }
.is-activity .nav-link { color:var(--city-purple); }
.is-activity .offer-quote { padding:9px 12px; margin:7px 0 12px; background:var(--city-soft); color:var(--city-purple); font-size:12px; }
.is-activity .offer-quote b { color:var(--city-purple); }
.is-activity .activity-detail-brief { padding:14px; gap:12px; margin:10px 0; background:var(--bg); border-color:var(--line); }
.is-activity :deep(.goods-tabs) { margin:0 14px; top:0; background:var(--bg); border-bottom:1px solid var(--line); }
.is-activity :deep(.goods-tabs button) { height:46px; font-size:14px; color:var(--muted); }
.is-activity :deep(.goods-tabs button.on) { color:var(--city-purple); font-weight:600; }
.is-activity :deep(.goods-tabs button.on::after) { background:var(--city-purple); height:3px; width:24px; bottom:3px; }
.is-activity .trip-pane { padding-top:16px; }
.is-activity .trip-pane .card { border:1px solid var(--line); border-radius:18px; box-shadow:none; }
.is-activity .card .pad { padding:18px; }
.is-activity .h2 { font-size:16px; margin:24px 4px 12px; font-weight:600; color:var(--ink); }
.is-activity .ticket-card { background:var(--city-soft); border:1px solid var(--line); border-radius:14px; padding:16px; color:var(--city-purple); }
.is-activity .ticket-card > strong { font-size:17px; font-weight:600; }
.is-activity .ticket-card .muted { color:var(--muted); font-size:12px; line-height:1.8; }
.is-activity .ticket-actions { display:flex; gap:10px; margin-top:14px; }
.is-activity .ticket-actions .btn { flex:1; min-width:0; padding:10px 8px; border-radius:24px; font-size:13px; }
.is-activity .btn { background:var(--city-purple); border:1px solid var(--city-purple); color:#fff; box-shadow:none; border-radius:24px; font-size:13px; }
.is-activity .btn.ghost { background:var(--card,#fff); border-color:var(--line); color:var(--city-purple); }
.city-progress-title { display:flex; justify-content:space-between; color:var(--muted); font-size:12px; margin:18px 0 10px; }
.city-progress-title strong { color:var(--city-purple); font-size:13px; font-weight:600; }
.is-activity .progress { height:5px; border-radius:5px; margin:0 0 9px; background:var(--city-soft); }
.is-activity .progress i { background:#aa8bc6; }
.is-activity .row .muted { font-size:11px; }
.city-group-heading { font-size:15px; color:var(--ink); font-weight:600; }
.city-group-heading span { display:block; font-size:11px; margin-top:7px; color:var(--muted); font-weight:400; }
.city-group-content { display:flex; gap:16px; align-items:center; margin-top:17px; font-size:13px; line-height:1.8; }
.city-group-content > a { flex:none; }
.city-group-qr { display:block; width:120px; height:120px; object-fit:contain; border-radius:10px; background:#fff; }
.city-group-content > div { flex:1; min-width:0; overflow-wrap:anywhere; }
.city-group-content p { margin:0 0 10px; }
.city-group-content small { display:block; margin-top:8px; color:var(--muted); font-size:11px; }
.city-group-empty { background:var(--city-soft); padding:13px; border-radius:10px; font-size:12px; line-height:1.8; color:var(--muted); margin:15px 0 0; }
.city-rules h2 { font-size:16px; font-weight:600; margin:0 0 14px; }
.city-rules p { font-size:13px; color:var(--muted); line-height:1.9; }
.is-activity .enroll-dock { border-top:1px solid var(--line); background:var(--card,#fff); box-shadow:none; padding:12px 18px calc(12px + env(safe-area-inset-bottom)); }
.is-activity .enroll-dock .enroll-price b { color:var(--city-purple); font-size:18px; }
.is-activity .enroll-dock .btn { min-width:130px; }
.is-activity .enroll-dock > p { color:var(--city-purple); font-size:13px; }
.city-group-empty button.nav-link { border:0; padding:0 0 0 8px; background:none; font:inherit; cursor:pointer; }
.dissolve-mask { position:fixed; inset:0; z-index:2000; display:flex; align-items:center; justify-content:center; box-sizing:border-box; padding:20px; background:rgba(29,21,39,.5); }
.dissolve-dialog { width:100%; max-width:420px; max-height:80vh; overflow-y:auto; box-sizing:border-box; border-radius:20px; padding:24px; background:var(--card,#fff); color:var(--ink,#29232f); outline:none; }
.dissolve-dialog h2 { margin:0; font-size:19px; }
.dissolve-dialog p { margin:14px 0; color:var(--muted,#8d8198); font-size:13px; line-height:1.8; }
.dissolve-dialog label { display:block; font-size:13px; margin-bottom:8px; }
.dissolve-dialog textarea { width:100%; box-sizing:border-box; resize:vertical; min-height:96px; }
.dissolve-dialog p.dissolve-error { color:#ac536a; }
.dissolve-actions { display:flex; gap:10px; margin-top:20px; }
.dissolve-actions .btn { flex:1; min-width:0; margin:0; padding:12px 8px; border-radius:24px; font-size:13px; }
</style>
