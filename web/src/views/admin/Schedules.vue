<template>
  <div>
    <div class="row">
      <h2>发团与排期</h2>
      <div class="admin-schedules-actions">
        <el-checkbox v-model="showCancelled" :disabled="!cancelledCount && !showCancelled">
          显示已解散<span v-if="cancelledCount">（{{ cancelledCount }}）</span>
        </el-checkbox>
        <el-dropdown v-if="canOps" trigger="click"><el-button>批量工具 ⌄</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item @click="syncOfficial">同步官方团排期</el-dropdown-item><el-dropdown-item divided :disabled="!activeCount" @click="openDissolveAll"><span style="color:#bf7564">解散全部拼团（{{ activeCount }}）</span></el-dropdown-item></el-dropdown-menu></template></el-dropdown>
        <el-button v-if="canOps" type="success" @click="open">＋ 发布新团</el-button>
      </div>
    </div>
    <p class="admin-scroll-hint">统一管理高校、公司和个人发团。先核对待审申请，再安排车辆、导游与出行服务；费用和结算可在每个团的「更多操作」中处理。</p>
    <div class="ops-schedule-summary">
      <div><span>未解散的团</span><strong>{{ activeCount }}</strong></div><div><span>发团申请待审</span><strong>{{ pendingReviewCount }}</strong></div><div><span>正在招募的团</span><strong>{{ recruitingCount }}</strong></div><div><span>已取消的团</span><strong>{{ cancelledCount }}</strong></div>
    </div>
    <div class="ops-schedule-filters">
      <el-input v-model="scheduleQuery" clearable placeholder="搜索线路、发起人、公司或出发日期" class="ops-schedule-search" />
      <el-select v-model="scheduleState" clearable placeholder="全部状态"><el-option label="等待审批" value="pending" /><el-option label="招募中" value="recruiting" /><el-option label="已成团" value="confirmed" /><el-option label="带团中" value="started" /><el-option label="已结束" value="completed" /></el-select>
      <span class="ops-filter-result">共 {{ visibleList.length }} 个团</span>
    </div>
    <el-table v-if="!compactTable" v-loading="listLoading" element-loading-text="正在同步发团计划" :data="visibleList" class="admin-schedules-table" :empty-text="listLoading ? '加载中…' : emptyText">
      <el-table-column label="线路与组织" min-width="210" :fixed="compactTable ? false : 'left'"><template #default="{ row }"><strong class="ops-table-title">{{ row.route?.title }}</strong><div class="ops-table-sub">{{ organizerTypeText(row.organizerType, true) }}<template v-if="row.companyName || row.organizerName"> · {{ row.companyName || row.organizerName }}</template></div></template></el-table-column>
      <el-table-column label="出发与集合" width="130"><template #default="{ row }"><span>{{ row.startDate }}</span><div class="ops-table-sub">{{ row.meetupTime }} · {{ row.meetupPoint }}</div></template></el-table-column>
      <el-table-column label="当前进度" width="155"><template #default="{ row }">
        <span class="ops-status-pill" :class="{ pending: row.reviewStatus === 'pending', done: row.guaranteed || row.status === 'confirmed', cancelled: row.status === 'cancelled' }">{{ row.completedAt ? '已结束' : row.startedAt && row.status !== 'cancelled' ? '带团中' : scheduleStatusText(row.status === 'recruiting' && row.guaranteed ? 'confirmed' : row.status) }}</span>
        <div v-if="canOps && row.reviewStatus === 'pending'" class="admin-review-ops ops-review-buttons"><el-button size="small" link type="primary" :loading="reviewing.id === row.id && reviewing.status === 'approved'" :disabled="reviewing.id === row.id" @click="review(row, 'approved')">通过申请</el-button><el-button size="small" link type="danger" :loading="reviewing.id === row.id && reviewing.status === 'rejected'" :disabled="reviewing.id === row.id" @click="review(row, 'rejected')">驳回</el-button></div><div v-else-if="row.reviewStatus === 'pending'" class="ops-table-sub">等待运营审核</div><div v-else-if="row.reviewStatus === 'rejected'" class="ops-table-sub">发团申请已驳回</div>
      </template></el-table-column>
      <el-table-column label="报名与座位" width="130"><template #default="{ row }"><strong class="ops-table-number">{{ row.enrolled }}</strong><span class="ops-table-sub"> / {{ row.maxSeats }} 人</span><div class="ops-table-sub" v-if="row.virtualEnrolled">含 {{ row.virtualEnrolled }} 位虚拟占座</div><div class="ops-table-sub" v-if="row.oversub?.applied || row.waitlistCount"><template v-if="row.oversub?.applied">{{ row.oversub.applied }} 位待确认 </template><template v-if="row.waitlistCount">{{ row.waitlistCount }} 位候补</template></div></template></el-table-column>
      <el-table-column label="接待安排" width="130"><template #default="{ row }"><span>{{ row.bus?.name || '车辆待确认' }}</span><div class="ops-table-sub"><el-button v-if="row.guide" link type="primary" @click="openGuide(row)">导游 · {{ row.guide.name }}</el-button><span v-else>导游待匹配</span></div></template></el-table-column>
      <el-table-column label="报名范围" width="155"><template #default="{ row }"><span>{{ row.eligibility?.label || '公开报名' }}</span><div class="ops-table-sub" v-if="row.private">口令 · {{ row.joinCode || row.privateLabel || '口令团' }}</div><div class="ops-table-sub" v-if="row.oversub?.enabled">{{ row.oversub.label }}</div></template></el-table-column>
      <el-table-column v-if="canOps" label="经营情况" width="140" align="right"><template #default="{ row }"><span>实收 ¥{{ money(row.revenue) }}</span><div class="ops-table-sub">成本 ¥{{ money(row.cost) }}</div><div class="ops-table-sub">利润 ¥{{ money(row.profit) }}</div></template></el-table-column>
      <el-table-column label="操作" width="205" :fixed="compactTable ? false : 'right'"><template #default="{ row }"><div class="ops-schedule-row-actions">
        <el-button v-if="canField" size="small" :disabled="row.status === 'cancelled'" @click="openCheckinDlg(row)">带团服务</el-button><el-button v-else-if="canOps" size="small" @click="cost(row)">经营成本</el-button>
        <el-dropdown trigger="click"><el-button size="small">更多操作 <span aria-hidden="true" style="margin-left:5px">⌄</span></el-button><template #dropdown><el-dropdown-menu>
          <el-dropdown-item v-if="canOps" @click="cost(row)">费用与成本</el-dropdown-item><el-dropdown-item v-if="canField" @click="openTrip(row)">车辆与座位</el-dropdown-item><el-dropdown-item @click="demo(row)">查看本团画像</el-dropdown-item><el-dropdown-item v-if="canOps && row.oversub?.enabled && !row.oversub?.drawn" :disabled="row.status === 'cancelled' || drawingId === row.id" @click="confirmDraw(row)">确认出行名单</el-dropdown-item>
          <el-dropdown-item v-if="canOps" divided :disabled="row.organizerType !== 'company' || row.status === 'cancelled' || settlingId === row.id" @click="settle(row)">企业团挂账结算</el-dropdown-item><el-dropdown-item v-if="canOps" @click="openSplit(row)">查看分账</el-dropdown-item><el-dropdown-item v-if="canOps" @click="openLimit(row)">报名范围与限制</el-dropdown-item>
          <el-dropdown-item v-if="canOps" divided :disabled="row.status === 'cancelled'" @click="$router.push('/admin/lottery?scheduleId=' + row.id)">活动抽奖</el-dropdown-item><el-dropdown-item v-if="canOps" :disabled="row.organizerType === 'company' || row.status === 'cancelled'" @click="$router.push('/admin/coupons?scheduleId=' + row.id)">优惠券</el-dropdown-item><el-dropdown-item v-if="canOps" :disabled="row.status === 'cancelled'" @click="openVirtual(row)">虚拟占座</el-dropdown-item><el-dropdown-item v-if="canOps" :disabled="row.status === 'cancelled'" @click="openReview(row)">虚拟评价</el-dropdown-item><el-dropdown-item v-if="canOps" divided :disabled="row.status === 'cancelled'" @click="openDissolve(row)"><span style="color:#bf7564">解散本团</span></el-dropdown-item>
        </el-dropdown-menu></template></el-dropdown>
      </div></template></el-table-column>
    </el-table>
    <div v-else v-loading="listLoading" class="ops-schedule-mobile-list" element-loading-text="正在同步发团计划">
      <div v-for="row in visibleList" :key="row.id" class="ops-schedule-mobile-card">
        <div class="ops-mobile-card-heading"><div><strong>{{ row.route?.title }}</strong><span>{{ organizerTypeText(row.organizerType, true) }}<template v-if="row.companyName || row.organizerName"> · {{ row.companyName || row.organizerName }}</template></span></div><span class="ops-status-pill" :class="{ pending: row.reviewStatus === 'pending', done: row.guaranteed || row.status === 'confirmed', cancelled: row.status === 'cancelled' }">{{ row.completedAt ? '已结束' : row.startedAt && row.status !== 'cancelled' ? '带团中' : scheduleStatusText(row.status === 'recruiting' && row.guaranteed ? 'confirmed' : row.status) }}</span></div>
        <div class="ops-mobile-card-facts"><span><OperationsIcon name="calendar" />{{ row.startDate }}</span><span><OperationsIcon name="pin" />{{ row.meetupPoint }}</span><span><OperationsIcon name="clock" />{{ row.meetupTime }}</span></div>
        <div v-if="canOps && row.reviewStatus === 'pending'" class="ops-mobile-review"><span>发团申请待审核</span><div><el-button size="small" link type="primary" :loading="reviewing.id === row.id && reviewing.status === 'approved'" :disabled="reviewing.id === row.id" @click="review(row, 'approved')">通过申请</el-button><el-button size="small" link type="danger" :loading="reviewing.id === row.id && reviewing.status === 'rejected'" :disabled="reviewing.id === row.id" @click="review(row, 'rejected')">驳回</el-button></div></div>
        <div v-else-if="row.reviewStatus === 'pending'" class="ops-mobile-review"><span>等待运营审核</span></div><div v-else-if="row.reviewStatus === 'rejected'" class="ops-mobile-review is-rejected"><span>发团申请已驳回</span></div>
        <div class="ops-mobile-card-summary"><div><span>报名进度</span><strong>{{ row.enrolled }}<small> / {{ row.maxSeats }} 人</small></strong><small v-if="row.waitlistCount">候补 {{ row.waitlistCount }} 人</small></div><div><span>车辆与导游</span><strong>{{ row.bus?.name || '车辆待确认' }}</strong><small>{{ row.guide ? `导游 · ${row.guide.name}` : '导游待匹配' }}</small></div><div v-if="canOps"><span>经营情况</span><strong>¥{{ money(row.revenue) }}<small> 实收</small></strong><small>成本 ¥{{ money(row.cost) }} · 利润 ¥{{ money(row.profit) }}</small></div></div>
        <div class="ops-mobile-card-foot"><span>{{ row.eligibility?.label || '公开报名' }}<template v-if="row.private"> · 口令 {{ row.joinCode || row.privateLabel || '口令团' }}</template></span><div class="ops-schedule-row-actions"><el-button v-if="canField" size="small" :disabled="row.status === 'cancelled'" @click="openCheckinDlg(row)">带团服务</el-button><el-button v-else-if="canOps" size="small" @click="cost(row)">经营成本</el-button><el-dropdown trigger="click"><el-button size="small">更多操作 <span aria-hidden="true" style="margin-left:5px">⌄</span></el-button><template #dropdown><el-dropdown-menu>
          <el-dropdown-item v-if="canOps" @click="cost(row)">费用与成本</el-dropdown-item><el-dropdown-item v-if="canField" @click="openTrip(row)">车辆与座位</el-dropdown-item><el-dropdown-item @click="demo(row)">查看本团画像</el-dropdown-item><el-dropdown-item v-if="canOps && row.oversub?.enabled && !row.oversub?.drawn" :disabled="row.status === 'cancelled' || drawingId === row.id" @click="confirmDraw(row)">确认出行名单</el-dropdown-item><el-dropdown-item v-if="canOps" divided :disabled="row.organizerType !== 'company' || row.status === 'cancelled' || settlingId === row.id" @click="settle(row)">企业团挂账结算</el-dropdown-item><el-dropdown-item v-if="canOps" @click="openSplit(row)">查看分账</el-dropdown-item><el-dropdown-item v-if="canOps" @click="openLimit(row)">报名范围与限制</el-dropdown-item><el-dropdown-item v-if="canOps" divided :disabled="row.status === 'cancelled'" @click="$router.push('/admin/lottery?scheduleId=' + row.id)">活动抽奖</el-dropdown-item><el-dropdown-item v-if="canOps" :disabled="row.organizerType === 'company' || row.status === 'cancelled'" @click="$router.push('/admin/coupons?scheduleId=' + row.id)">优惠券</el-dropdown-item><el-dropdown-item v-if="canOps" :disabled="row.status === 'cancelled'" @click="openVirtual(row)">虚拟占座</el-dropdown-item><el-dropdown-item v-if="canOps" :disabled="row.status === 'cancelled'" @click="openReview(row)">虚拟评价</el-dropdown-item><el-dropdown-item v-if="canOps" divided :disabled="row.status === 'cancelled'" @click="openDissolve(row)"><span style="color:#bf7564">解散本团</span></el-dropdown-item>
        </el-dropdown-menu></template></el-dropdown></div></div>
      </div>
      <div v-if="!listLoading && !visibleList.length" class="ops-empty"><OperationsIcon name="calendar" /><p>{{ emptyText }}</p></div>
    </div>

    <el-dialog v-model="showCost" title="活动成本" width="480px">
      <el-form label-width="90px" v-if="cur">
        <el-form-item label="大巴"><el-input-number v-model="cur.costBreakdown.transport" /></el-form-item>
        <el-form-item label="门票"><el-input-number v-model="cur.costBreakdown.ticket" /></el-form-item>
        <el-form-item label="住宿"><el-input-number v-model="cur.costBreakdown.hotel" /></el-form-item>
        <el-form-item label="餐食"><el-input-number v-model="cur.costBreakdown.meal" /></el-form-item>
        <el-form-item label="导游"><el-input-number v-model="cur.costBreakdown.guide" /></el-form-item>
        <el-form-item label="其他"><el-input-number v-model="cur.costBreakdown.other" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button type="success" @click="saveCost">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDemo" title="本团画像" width="720px">
      <div ref="g1" style="height:220px"></div>
      <div ref="g2" style="height:220px"></div>
      <div ref="g3" style="height:260px"></div>
    </el-dialog>

    <el-dialog v-model="showNew" title="发布拼团" width="720px">
      <el-form label-width="100px">
        <el-form-item label="线路">
          <el-select v-model="neu.routeId" filterable>
            <el-option v-for="r in routes" :key="r.id" :label="r.title" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期"><el-input v-model="neu.startDate" type="date" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="neu.organizerType">
            <el-option label="官方开团" value="official" />
            <el-option label="个人开团" value="individual" />
            <el-option label="公司开团" value="company" />
            <el-option label="高校开团" value="campus" />
          </el-select>
          <p v-if="neu.organizerType === 'official'" class="muted" style="margin:6px 0 0">官方团用户端直接显示「官方」。上架线路会按天自动补，也可在这里手开一场。</p>
        </el-form-item>
        <el-form-item v-if="neu.organizerType === 'company'" label="公司名">
          <el-input v-model="neu.companyName" placeholder="公司全称" />
        </el-form-item>
        <el-form-item v-if="neu.organizerType === 'campus'" label="发起学校">
          <CampusCatalogSelect v-model="neu.companyName" kind="school" placeholder="例如：北京大学" />
          <p class="muted" style="margin:6px 0 0">写在团上，表示哪个学校在组织，不限制谁能报名。</p>
        </el-form-item>
        <el-form-item label="车型">
          <el-select v-model="neu.busTypeId">
            <el-option v-for="b in buses" :key="b.id" :label="b.name" :value="b.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="成团人数"><el-input-number v-model="neu.minGroupSize" /></el-form-item>
        <el-form-item label="集合点">
          <el-select v-model="neu.meetupPoint" allow-create filterable>
            <el-option v-for="p in meetupPoints" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="集合时间"><el-input v-model="neu.meetupTime" /></el-form-item>
        <el-form-item label="团型">
          <el-select v-model="neu.offerType">
            <el-option label="早鸟团" value="early" />
            <el-option label="特惠团" value="deal" />
            <el-option label="免费团" value="free" />
            <el-option label="全家团" value="family" />
            <el-option label="组合团" value="combo" />
            <el-option label="全价团" value="full" />
          </el-select>
        </el-form-item>
        <template v-if="neu.organizerType === 'campus'">
          <el-form-item label="仅师生">
            <el-switch v-model="neu.studentOnly" />
          </el-form-item>
          <el-form-item label="允许校友">
            <el-switch v-model="neu.alumniOk" />
          </el-form-item>
          <el-form-item label="超额抽签">
            <el-switch v-model="neu.oversub" />
            <span v-if="neu.offerType === 'free'" class="muted" style="margin-left:8px">免费团默认开启：报名超过座位才抽签确认，未超过则全部确认</span>
          </el-form-item>
        </template>
        <el-form-item label="口令团">
          <el-switch v-model="neu.privateJoin" />
        </el-form-item>
        <el-form-item v-if="neu.privateJoin" label="入团口令">
          <el-input v-model="neu.joinCode" maxlength="16" placeholder="4～16 个字，可空则自动生成" />
        </el-form-item>
        <el-form-item v-if="neu.organizerType === 'campus'" label="报名范围">
          <AdminCampusTargetList v-model="neu.campusTargets" v-model:ratio="neu.genderRatio" />
          <p class="muted" style="margin:6px 0 0">谁可以报名。留空表示不限学校，也可以和发起学校不同。高校免费团如果这里留空，默认只让发起学校的师生报名。</p>
        </el-form-item>
        <el-form-item v-if="neu.organizerType === 'campus'" label-width="0px">
          <GenderRatioFields v-model="neu.genderRatio" :targets="neu.campusTargets" />
        </el-form-item>
        <el-form-item label="虚拟报名">
          <el-input-number v-model="neu.virtualCount" :min="0" :max="80" />
          <p class="muted" style="margin:6px 0 0">从虚拟用户池抽人占座，之后仍可在列表里改人数。</p>
        </el-form-item>
        <el-form-item label="抽奖">
          <el-select v-model="neu.lotteryMode">
            <el-option label="不开抽奖" value="off" />
            <el-option label="报名前抽奖" value="pre" />
            <el-option label="报名后抽奖" value="enroll" />
            <el-option label="报名前和报名后都抽" value="both" />
          </el-select>
          <p class="muted" style="margin:6px 0 0">中奖先记账并展示中奖率，跟团结束后领奖。发布后仍可在列表「抽奖」里改奖品。</p>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="neu.notes" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button type="success" @click="create">发布</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDissolve" :title="dissolveAll ? '解散全部拼团' : '解散拼团'" width="480px">
      <p v-if="dissolveAll">将解散当前全部 {{ activeCount }} 个进行中的拼团（含用户开团），取消报名、已付款按付款人原路退回，并向出行人发送取消短信。</p>
      <p v-else-if="cur">解散「{{ cur.route?.title }} {{ cur.startDate }}」后，将取消全部报名、已付款按付款人原路退回，并向出行人发送取消短信。</p>
      <el-input v-model="dissolveReason" type="textarea" :rows="3" placeholder="请填写解散理由，会写进短信发给报名用户" />
      <template #footer>
        <el-button @click="showDissolve = false">取消</el-button>
        <el-button type="danger" :loading="dissolving" @click="dissolve">确认解散并通知</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="showSplit" title="企业支付分账" width="560px">
      <p class="muted">模拟微信商户号分账：平台抽成 8%，导游按成本或 5%，剩余归开团公司。</p>
      <el-table :data="splitRows" stripe size="small">
        <el-table-column prop="name" label="接收方" />
        <el-table-column prop="party" label="角色" width="90">
          <template #default="{ row }">{{ { platform: "平台", guide: "导游", merchant: "商家" }[row.party] || row.party }}</template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" width="90" />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">{{ row.status === "success" ? "已分账" : "待分账" }}</template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showSplit = false">关闭</el-button>
        <el-button type="success" @click="runSplit">发起/查看分账</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showTrip" title="车辆、锁定座位与调座" width="560px">
      <el-form label-width="110px" v-if="cur">
        <el-form-item label="车牌号"><el-input v-model="tripForm.plateNo" placeholder="确认后填写" /></el-form-item>
        <el-form-item label="本团咨询群"><el-input v-model="tripForm.consultGroup" placeholder="群名或口令" /></el-form-item>
        <el-form-item label="锁定座位">
          <el-input v-model="tripForm.lockedText" placeholder="如 3A,3B 空位可锁给工作人员" />
        </el-form-item>
        <el-form-item label="调换座位">
          <el-select v-model="tripForm.enrollmentId" placeholder="出行人" clearable style="width:180px">
            <el-option v-for="c in chain" :key="c.id" :label="(c.seatNo || '-') + ' ' + c.name" :value="c.id" />
          </el-select>
          <el-input v-model="tripForm.toSeat" placeholder="目标座位 2C" style="width:120px;margin-left:8px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTrip = false">关闭</el-button>
        <el-button type="success" @click="saveTrip">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showCheckin" :title="checkinTitle" width="640px">
      <p class="muted">出发前上车和每个休息点都可以再开一轮。核对后点确认，下一轮才能发起。没上车、没有签到的交费客行程结束后仍可抽奖。</p>
      <div v-if="checkinData" class="checkin-toolbar">
        <el-button v-if="!checkinData.startedAt" type="success" :loading="startingTrip" @click="startOfficialAdmin">正式开团</el-button>
        <span v-else>已正式开团 {{ checkinData.startedAt }}</span>
        <el-button v-if="checkinData.canCloseTrip" type="warning" :loading="closingTrip" @click="closeTripAdmin">结束行程</el-button>
        <span v-else-if="checkinData.completedAt">已结束行程 {{ checkinData.completedAt }}</span>
        <span v-else class="muted">行程结束后可统一结束，出行人不用各自点击</span>
        <template v-if="checkinOpen">
          <strong>本轮 {{ checkinOpen.title }} · {{ checkinOpen.markedCount }}/{{ checkinOpen.total }}</strong>
          <el-button type="primary" :loading="confirmingCheckin" @click="confirmCheckinRound">确认本轮签到</el-button>
        </template>
        <template v-else>
          <el-select v-model="checkinStopKey" style="width:220px">
            <el-option v-for="st in checkinStops" :key="st.key" :label="(st.time ? st.time + ' ' : '') + st.title" :value="st.key" />
          </el-select>
          <el-button :loading="openingCheckin" @click="openCheckinRound">发起签到</el-button>
        </template>
      </div>
      <el-table v-loading="checkinLoading" element-loading-text="加载中…" :data="checkinData?.roster || []" stripe size="small" max-height="360" :empty-text="checkinLoading ? ' ' : '暂无数据'">
        <el-table-column prop="seatNo" label="座" width="60" />
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="phone" label="手机" width="130" />
        <el-table-column label="本轮" width="90">
          <template #default="{ row }">{{ checkinOpen ? (row.sessionChecked ? "已到" : "未到") : (row.checkinAt ? "曾签到" : "未签") }}</template>
        </el-table-column>
        <el-table-column label="" width="90">
          <template #default="{ row }">
            <el-button v-if="checkinOpen && !row.sessionChecked" link type="primary" :disabled="markingId === row.id" @click="markCheckinRow(row, true)">签到</el-button>
            <el-button v-else-if="checkinOpen && row.sessionChecked" link :disabled="markingId === row.id" @click="markCheckinRow(row, false)">撤销</el-button>
            <el-button v-else-if="!row.checkinAt" link type="primary" :disabled="markingId === row.id" @click="markCheckinRow(row, true)">签到</el-button>
          </template>
        </el-table-column>
      </el-table>
      <p v-if="checkinPast.length" class="muted" style="margin-top:10px">
        <span v-for="sess in checkinPast" :key="sess.id" style="margin-right:12px">{{ sess.title }} 已确认 {{ sess.markedCount }}/{{ sess.total }}</span>
      </p>
      <template #footer>
        <el-button @click="showCheckin = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showLimit" title="报名限制" width="720px">
      <p v-if="cur">「{{ cur.route?.title }} {{ cur.startDate }}」{{ cur.organizerType === 'campus' ? '可以改成团人数，也可以限制师生、报名范围和男女比例。' : '可以改成团人数。师生、报名范围和男女比例只在高校开团里设置。' }}</p>
      <el-form label-width="100px">
        <el-form-item label="成团人数">
          <el-input-number v-model="limitForm.minGroupSize" :min="1" :max="80" />
          <p class="muted" style="margin:6px 0 0">只算真实报名。改完后如果已经够人数，这个团会标成已成团。</p>
        </el-form-item>
        <template v-if="cur && cur.organizerType === 'campus'">
          <el-form-item label="仅师生">
            <el-switch v-model="limitForm.studentOnly" />
          </el-form-item>
          <el-form-item label="允许校友">
            <el-switch v-model="limitForm.alumniOk" />
          </el-form-item>
          <el-form-item label="超额抽签">
            <el-switch v-model="limitForm.oversub" />
          </el-form-item>
          <el-form-item label="报名范围">
            <AdminCampusTargetList v-model="limitForm.campusTargets" v-model:ratio="limitForm.genderRatio" />
            <p class="muted" style="margin:6px 0 0">谁可以报名。留空表示不限学校。发起学校只表示谁在组织。</p>
          </el-form-item>
          <el-form-item label-width="0px">
            <GenderRatioFields v-model="limitForm.genderRatio" :targets="limitForm.campusTargets" />
          </el-form-item>
          <p class="muted">超额抽签：先报名待确认。人数超过座位才抽签，未超过则全部确认。</p>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="showLimit = false">取消</el-button>
        <el-button type="success" :loading="savingLimit" @click="saveLimit">保存</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="showVirtual" title="本团虚拟报名" width="520px">
      <p v-if="cur">
        「{{ cur.route?.title }} {{ cur.startDate }}」真实 {{ cur.realEnrolled || 0 }} 人、虚拟 {{ cur.virtualEnrolled || 0 }} 人、座位 {{ cur.maxSeats }}。
      </p>
      <p class="muted">官方团和用户自建团默认开自动热度（规则 A：真人 +1 则虚拟 −1，展示钉在成团人数约 45%，且低于成团线）。口令团、同城局不开。改人数会暂停自动。</p>
      <p v-if="cur?.heat" class="muted">底线 {{ cur.heat.floor }} · 种子 {{ cur.heat.seed }} · 上限 {{ cur.heat.ceiling }} · 当前目标 {{ cur.heat.target }}{{ cur.heatLocked ? " · 已锁手工人数" : "" }}</p>
      <el-form label-width="120px">
        <el-form-item label="自动热度">
          <el-switch v-model="heatAuto" />
        </el-form-item>
        <el-form-item label="虚拟报名人数">
          <el-input-number v-model="virtualCount" :min="0" :max="80" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showVirtual = false">取消</el-button>
        <el-button @click="saveHeatAuto">{{ heatAuto ? "恢复自动" : "关闭自动" }}</el-button>
        <el-button type="success" :loading="savingVirtual" @click="saveVirtual">保存人数</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="showReview" :title="cur ? `虚拟评价 · ${cur.route?.title || ''} ${cur.startDate || ''}` : '虚拟评价'" width="480px">
      <p class="muted">这些评论由虚拟用户撰写，线路页和团详情会标明「虚拟用户」。优先用本团已占座的虚拟报名。</p>
      <el-form label-width="90px">
        <el-form-item label="条数">
          <el-input-number v-model="reviewForm.count" :min="1" :max="30" />
        </el-form-item>
        <el-form-item label="分数">
          <el-input-number v-model="reviewForm.rating" :min="1" :max="5" />
        </el-form-item>
        <el-form-item label="评语">
          <el-input v-model="reviewForm.content" type="textarea" :rows="3" placeholder="可空，空则用常用评语" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showReview = false">取消</el-button>
        <el-button type="success" :loading="savingReview" @click="saveReview">发布虚拟评价</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showGuide" :title="guideDetail?.name || '导游详情'" width="480px">
      <template v-if="guideDetail">
        <p>评分 {{ guideDetail.rating }} · 从业 {{ guideDetail.years }} 年 · 已带团 {{ guideDetail.tripCount }} 次</p>
        <p class="muted">擅长：{{ guideDetail.specialties }}</p>
        <p class="muted" v-if="guideDetail.languages">语言：{{ guideDetail.languages }}</p>
        <p>{{ guideDetail.bio }}</p>
        <p class="muted" v-if="guideDetail.upcoming?.length">近期：{{ guideDetail.upcoming.map((s) => s.startDate + " " + s.title).join("；") }}</p>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import * as echarts from "echarts";
import { ElMessage, ElMessageBox } from "element-plus";
import { organizerTypeText, scheduleStatusText } from "@/utils/labels";
import http from "@/api/http";
import { hasCap } from "@/utils/staff";
import CampusCatalogSelect from "@/components/admin/CampusCatalogSelect.vue";
import AdminCampusTargetList from "@/components/admin/CampusTargetList.vue";
import GenderRatioFields from "@/components/GenderRatioFields.vue";
import OperationsIcon from "@/components/OperationsIcon.vue";
import { normalizeCampusTargets } from "@/utils/campusTargets";
import { emptyGenderRatio, genderRatioFromSaved, genderRatioPayload } from "@/utils/genderRatio";
const route = useRoute();
const $router = useRouter();
const me = ref({ caps: [] });
const canOps = computed(() => hasCap(me.value, "ops"));
const canField = computed(() => hasCap(me.value, "field"));

const meetupPoints = ["东直门东方银座C口", "西直门凯德mall北门外", "国贸桥下大巴停靠点", "丽泽桥西南角"];
const list = ref([]);
const listLoading = ref(true);
const reviewing = ref({ id: 0, status: "" });
const showCancelled = ref(false);
const routes = ref([]);
const buses = ref([]);
const showCost = ref(false);
const showDemo = ref(false);
const showNew = ref(false);
const showDissolve = ref(false);
const showSplit = ref(false);
const showGuide = ref(false);
const showTrip = ref(false);
const showCheckin = ref(false);
const checkinData = ref(null);
const checkinStopKey = ref("depart");
const startingTrip = ref(false);
const closingTrip = ref(false);
const openingCheckin = ref(false);
const confirmingCheckin = ref(false);
const checkinLoading = ref(false);
const markingId = ref(0);
const checkinOpen = computed(() => checkinData.value?.checkin?.openSession || null);
const checkinStops = computed(() => checkinData.value?.checkin?.stops || []);
const checkinPast = computed(() => (checkinData.value?.checkin?.sessions || []).filter((row) => row.status === "confirmed"));
const checkinTitle = computed(() => {
  const title = checkinData.value?.route?.title || cur.value?.route?.title || "";
  const date = checkinData.value?.startDate || cur.value?.startDate || "";
  return title ? `开团签到 · ${title} ${date}` : "开团签到";
});
const showLimit = ref(false);
const savingLimit = ref(false);
const drawingId = ref(0);
const limitForm = ref({ minGroupSize: 2, studentOnly: false, alumniOk: false, oversub: false, campusTargets: [], genderRatio: emptyGenderRatio() });
const showVirtual = ref(false);
const virtualCount = ref(0);
const heatAuto = ref(true);
const savingVirtual = ref(false);
const virtualPool = ref({ total: 0, idle: 0, busy: 0 });
const showReview = ref(false);
const savingReview = ref(false);
const reviewForm = ref({ count: 3, rating: 5, content: "" });
const tripForm = ref({ plateNo: "", consultGroup: "", lockedText: "", enrollmentId: null, toSeat: "" });
const chain = ref([]);
const guideDetail = ref(null);
const splitRows = ref([]);
const splitScheduleId = ref(0);
const dissolveAll = ref(false);
const dissolving = ref(false);
const dissolveReason = ref("");
const cur = ref(null);
const g1 = ref();
const g2 = ref();
const g3 = ref();
const neu = ref({
  organizerType: "official",
  minGroupSize: 10,
  busTypeId: "bus30",
  meetupPoint: "东直门东方银座C口",
  meetupTime: "07:30",
  notes: "",
  companyName: "",
  offerType: "full",
  studentOnly: false,
  alumniOk: false,
  oversub: false,
  privateJoin: false,
  joinCode: "",
  campusTargets: [],
  virtualCount: 0,
  lotteryMode: "off",
  genderRatio: emptyGenderRatio(),
});
watch(
  () => [neu.value.organizerType, neu.value.offerType],
  ([type, offer], prev = []) => {
    const wasCampusFree = prev[0] === "campus" && prev[1] === "free";
    const isCampusFree = type === "campus" && offer === "free";
    if (isCampusFree && !wasCampusFree) {
      neu.value.oversub = true;
      neu.value.studentOnly = true;
    }
  }
);
async function openLimit(row) {
  cur.value = row;
  const detail = (await http.get(`/admin/schedules/${row.id}`)).data || row;
  cur.value = { ...row, ...detail };
  const saved = detail.genderRatio || {};
  limitForm.value = {
    minGroupSize: Number(detail.minGroupSize || 2),
    studentOnly: !!detail.eligibility?.studentOnly,
    alumniOk: !!detail.eligibility?.alumniOk,
    oversub: !!detail.oversub?.enabled,
    campusTargets: normalizeCampusTargets(detail.eligibility?.targets || []),
    genderRatio: genderRatioFromSaved(saved),
  };
  showLimit.value = true;
}
async function saveLimit() {
  savingLimit.value = true;
  try {
    await http.put(`/admin/schedules/${cur.value.id}/limit`, {
      minGroupSize: limitForm.value.minGroupSize,
      studentOnly: limitForm.value.studentOnly,
      alumniOk: limitForm.value.alumniOk,
      oversub: limitForm.value.oversub,
      campusTargets: normalizeCampusTargets(limitForm.value.campusTargets),
      ...(cur.value?.organizerType === "campus" ? { genderRatio: genderRatioPayload(limitForm.value.genderRatio) } : {}),
    });
    showLimit.value = false;
    ElMessage.success("报名限制已更新");
    await load();
  } catch (e) {
    ElMessage.error(e.message || "保存失败");
  } finally {
    savingLimit.value = false;
  }
}

async function openGuide(row) {
  if (!row.guide?.id) return;
  try {
    guideDetail.value = (await http.get("/guides/" + row.guide.id)).data;
    showGuide.value = true;
  } catch (e) {
    ElMessage.error(e.message || "导游详情加载失败");
  }
}
async function load() {
  if (!list.value.length) listLoading.value = true;
  try {
    try {
      me.value = (await http.get("/admin/me")).data;
    } catch {
      me.value = { caps: [] };
    }
    try {
      list.value = (await http.get("/admin/schedules")).data || [];
    } catch (e) {
      list.value = [];
      ElMessage.error(e.message || "拼团列表加载失败");
    }
    try {
      routes.value = (await http.get("/admin/routes")).data;
      buses.value = (await http.get("/buses")).data;
    } catch (e) {
      ElMessage.error(e.message || "线路加载失败");
    }
  } finally {
    listLoading.value = false;
  }
}
onMounted(load);
const scheduleQuery = ref("");
const scheduleState = ref("");
const settlingId = ref(0);
const compactTable = ref(window.innerWidth < 800);
const onResize = () => { compactTable.value = window.innerWidth < 800; };
onMounted(() => window.addEventListener("resize", onResize));
onUnmounted(() => window.removeEventListener("resize", onResize));
const money = (value) => Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const pendingReviewCount = computed(() => list.value.filter((row) => row.reviewStatus === "pending" && row.status !== "cancelled").length);
const activeCount = computed(() => list.value.filter((s) => s.status !== "cancelled").length);
const recruitingCount = computed(() => list.value.filter((s) => s.status === "recruiting" && !s.guaranteed && !s.startedAt && !s.completedAt).length);
const cancelledCount = computed(() => list.value.filter((s) => s.status === "cancelled").length);
const visibleList = computed(() => {
  const rows = (showCancelled.value ? list.value : list.value.filter((s) => s.status !== "cancelled")).filter((row) => {
    const query = scheduleQuery.value.trim().toLowerCase();
    if (query && ![row.route?.title, row.organizerName, row.companyName, row.startDate].some((value) => String(value || "").toLowerCase().includes(query))) return false;
    if (scheduleState.value === "pending") return row.reviewStatus === "pending";
    if (scheduleState.value === "started") return !!row.startedAt && !row.completedAt;
    if (scheduleState.value === "completed") return !!row.completedAt;
    if (scheduleState.value === "confirmed") return row.status !== "cancelled" && (row.guaranteed || row.status === "confirmed");
    if (scheduleState.value === "recruiting") return row.status === "recruiting" && !row.guaranteed && !row.startedAt && !row.completedAt;
    return true;
  });
  const focus = Number(route.query.id || 0);
  const pending = [];
  const rest = [];
  rows.forEach((row) => {
    if ((focus && Number(row.id) === focus) || row.reviewStatus === "pending") pending.push(row);
    else rest.push(row);
  });
  pending.sort((a, b) => {
    const af = focus && Number(a.id) === focus ? 0 : 1;
    const bf = focus && Number(b.id) === focus ? 0 : 1;
    return af - bf || Number(b.id) - Number(a.id);
  });
  return pending.concat(rest);
});
const emptyText = computed(() => {
  if (listLoading.value) return "加载中…";
  if (scheduleQuery.value || scheduleState.value) return "没有符合筛选条件的团，请调整关键词或状态";
  if (!showCancelled.value && cancelledCount.value) return "已解散的团已隐藏，打开「显示已解散」可查看";
  return "暂无数据";
});
function open() { showNew.value = true; }
async function syncOfficial() {
  try {
    const res = await http.post("/admin/schedules/official-sync");
    ElMessage.success(res.message || "已补齐官方团");
    await load();
  } catch (e) {
    ElMessage.error(e.message || "补齐失败");
  }
}
function openVirtual(row) {
  cur.value = row;
  virtualCount.value = Number(row.virtualEnrolled || 0);
  heatAuto.value = (row.heatMode || "auto") !== "off";
  showVirtual.value = true;
  http.get("/admin/virtual-users/pool").then((res) => {
    virtualPool.value = res.data || virtualPool.value;
  }).catch(() => {});
  http.get(`/admin/schedules/${row.id}`).then((res) => {
    if (!res.data) return;
    cur.value = res.data;
    virtualCount.value = Number(res.data.virtualEnrolled || virtualCount.value);
    heatAuto.value = (res.data.heatMode || "auto") !== "off";
  }).catch(() => {});
}
function openReview(row) {
  cur.value = row;
  reviewForm.value = { count: 3, rating: 5, content: "" };
  showReview.value = true;
}
async function saveReview() {
  savingReview.value = true;
  try {
    const res = await http.post(`/admin/schedules/${cur.value.id}/reviews`, reviewForm.value);
    showReview.value = false;
    ElMessage.success(res.message || "已发布评价");
  } catch (e) {
    ElMessage.error(e.message || "评价失败");
  } finally {
    savingReview.value = false;
  }
}
async function saveHeatAuto() {
  savingVirtual.value = true;
  try {
    const res = await http.post(`/admin/schedules/${cur.value.id}/virtual-users`, {
      heatMode: heatAuto.value ? "auto" : "off",
      lock: false,
    });
    showVirtual.value = false;
    ElMessage.success(heatAuto.value ? "已打开自动热度" : "已关闭自动热度");
    await load();
    return res;
  } catch (e) {
    ElMessage.error(e.message || "设置失败");
  } finally {
    savingVirtual.value = false;
  }
}
async function saveVirtual() {
  savingVirtual.value = true;
  try {
    const res = await http.post(`/admin/schedules/${cur.value.id}/virtual-users`, {
      count: virtualCount.value,
      heatMode: heatAuto.value ? "auto" : "off",
      lock: true,
    });
    showVirtual.value = false;
    ElMessage.success(res.message || "已更新虚拟报名");
    await load();
  } catch (e) {
    ElMessage.error(e.message || "设置失败");
  } finally {
    savingVirtual.value = false;
  }
}
function cost(row) { cur.value = JSON.parse(JSON.stringify(row)); showCost.value = true; }
async function openTrip(row) {
  cur.value = row;
  tripForm.value = {
    plateNo: row.bus?.plateNo || "",
    consultGroup: row.consultGroup || "",
    lockedText: "",
    enrollmentId: null,
    toSeat: "",
  };
  try {
    const seats = (await http.get(`/schedules/${row.id}/seats`)).data;
    tripForm.value.lockedText = (seats.lockedSeats || []).join(",");
  } catch {
    tripForm.value.lockedText = "";
  }
  try {
    chain.value = ((await http.get("/schedules/" + row.id)).data.chain || []).filter((c) => !c.waitlisted);
  } catch {
    chain.value = [];
  }
  showTrip.value = true;
}

async function openCheckinDlg(row) {
  cur.value = row;
  checkinData.value = null;
  showCheckin.value = true;
  checkinLoading.value = true;
  try {
    await loadCheckin(row.id);
  } catch (e) {
    ElMessage.error(e.message || "签到名单加载失败");
  } finally {
    checkinLoading.value = false;
  }
}

async function loadCheckin(id) {
  checkinData.value = (await http.get(`/admin/schedules/${id}/checkin`)).data;
  if (!checkinOpen.value) {
    const first = (checkinData.value?.checkin?.stops || [])[0];
    if (first) checkinStopKey.value = first.key;
  }
}

async function closeTripAdmin() {
  closingTrip.value = true;
  try {
    const data = (await http.post(`/admin/schedules/${cur.value.id}/complete`)).data;
    checkinData.value = data;
    ElMessage.success(data.already ? "行程已经结束" : "已结束行程，全团可以评价和评选");
    await load();
  } catch (e) {
    ElMessage.error(e.message || "结束失败");
  } finally {
    closingTrip.value = false;
  }
}

async function startOfficialAdmin() {
  startingTrip.value = true;
  try {
    const data = (await http.post(`/admin/schedules/${cur.value.id}/start`)).data;
    checkinData.value = data;
    ElMessage.success(data.already ? "已经正式开团" : "已正式开团");
    await load();
  } catch (e) {
    ElMessage.error(e.message || "开团失败");
  } finally {
    startingTrip.value = false;
  }
}

async function openCheckinRound() {
  openingCheckin.value = true;
  try {
    checkinData.value = (await http.post(`/admin/schedules/${cur.value.id}/checkins`, { stopKey: checkinStopKey.value })).data;
    ElMessage.success(`已发起「${checkinData.value.checkin?.openSession?.title || "签到"}」`);
  } catch (e) {
    ElMessage.error(e.message || "发起失败");
  } finally {
    openingCheckin.value = false;
  }
}

async function confirmCheckinRound() {
  if (!checkinOpen.value) return;
  confirmingCheckin.value = true;
  try {
    const title = checkinOpen.value.title;
    checkinData.value = (await http.post(`/admin/schedules/${cur.value.id}/checkins/${checkinOpen.value.id}/confirm`)).data;
    ElMessage.success(`已确认「${title}」`);
  } catch (e) {
    ElMessage.error(e.message || "确认失败");
  } finally {
    confirmingCheckin.value = false;
  }
}

async function markCheckinRow(row, marked) {
  markingId.value = row.id;
  try {
    await http.post(`/admin/schedules/${cur.value.id}/checkin`, { enrollmentId: row.id, marked });
    await loadCheckin(cur.value.id);
  } catch (e) {
    ElMessage.error(e.message || "签到失败");
  } finally {
    markingId.value = 0;
  }
}
async function saveTrip() {
  try {
    await http.put(`/admin/schedules/${cur.value.id}/trip`, {
      plateNo: tripForm.value.plateNo,
      consultGroup: tripForm.value.consultGroup,
    });
    const lockedSeats = String(tripForm.value.lockedText || "")
      .split(/[,，\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    await http.post(`/admin/schedules/${cur.value.id}/seats/lock`, { lockedSeats });
    if (tripForm.value.enrollmentId && tripForm.value.toSeat) {
      await http.post(`/admin/schedules/${cur.value.id}/seats/assign`, {
        enrollmentId: tripForm.value.enrollmentId,
        seatNo: tripForm.value.toSeat,
      });
    }
    showTrip.value = false;
    ElMessage.success("行程车辆与座位已更新");
    load();
  } catch (e) {
    ElMessage.error(e.message || "保存失败");
  }
}
async function saveCost() {
  await http.put(`/admin/schedules/${cur.value.id}/cost`, cur.value.costBreakdown);
  showCost.value = false;
  ElMessage.success("成本已更新");
  load();
}
async function settle(row) {
  if (settlingId.value) return;
  try { await ElMessageBox.confirm(`确认核对「${row.route?.title || "本团"}」的公司挂账，并完成结算吗？`, "结算确认", { confirmButtonText: "确认结算", cancelButtonText: "继续核对", type: "warning" }); }
  catch { return; }
  settlingId.value = row.id;
  try {
    const res = await http.post(`/admin/schedules/${row.id}/settle`);
    ElMessage.success(`已结算 ${res.data.count} 人`);
    await load();
    if (res.data.splits?.length) {
      splitRows.value = res.data.splits;
      splitScheduleId.value = row.id;
      showSplit.value = true;
    }
  } catch (e) { ElMessage.error(e.message || "结算失败，请稍后重试"); }
  finally { settlingId.value = 0; }
}
async function openSplit(row) {
  splitScheduleId.value = row.id;
  try {
    splitRows.value = (await http.get(`/admin/schedules/${row.id}/splits`)).data;
  } catch {
    splitRows.value = [];
  }
  showSplit.value = true;
}
async function runSplit() {
  try {
    const res = await http.post(`/admin/schedules/${splitScheduleId.value}/split`);
    splitRows.value = res.data.splits;
    ElMessage.success(res.data.reused ? "已有分账记录" : "已模拟分账到账");
  } catch (e) {
    ElMessage.error(e.message || "分账失败");
  }
}
function openDissolve(row) {
  cur.value = row;
  dissolveAll.value = false;
  dissolveReason.value = "";
  showDissolve.value = true;
}
function openDissolveAll() {
  cur.value = null;
  dissolveAll.value = true;
  dissolveReason.value = "";
  showDissolve.value = true;
}
async function dissolve() {
  if (!dissolveReason.value.trim()) {
    ElMessage.warning("请填写解散理由");
    return;
  }
  dissolving.value = true;
  try {
    const url = dissolveAll.value ? "/admin/schedules/dissolve-all" : `/admin/schedules/${cur.value.id}/dissolve`;
    const res = await http.post(url, { reason: dissolveReason.value.trim() });
    showDissolve.value = false;
    if (dissolveAll.value) {
      ElMessage.success(`已解散 ${res.data.count} 个拼团：取消 ${res.data.cancelled} 人，退款 ${res.data.refunded} 人，短信 ${res.data.smsCount} 条`);
    } else {
      ElMessage.success(`已解散：取消 ${res.data.cancelled} 人，退款 ${res.data.refunded} 人，短信 ${res.data.smsCount} 条`);
    }
    load();
  } finally {
    dissolving.value = false;
  }
}
async function demo(row) {
  showDemo.value = true;
  const d = (await http.get(`/admin/schedules/${row.id}/demographics`)).data;
  await nextTick();
  echarts.init(g1.value).setOption({ title: { text: "性别" }, series: [{ type: "pie", data: d.gender }] });
  echarts.init(g2.value).setOption({ title: { text: "年龄" }, series: [{ type: "pie", data: d.age.filter((x) => x.value) }] });
  echarts.init(g3.value).setOption({
    title: { text: "籍贯" },
    xAxis: { type: "category", data: d.hometown.map((x) => x.name), axisLabel: { rotate: 30 } },
    yAxis: {},
    series: [{ type: "bar", data: d.hometown.map((x) => x.value) }],
  });
}
async function confirmDraw(row) {
  try {
    await ElMessageBox.confirm(
      "将按座位确认出行人。报名超过座位时抽签，未超过则全部确认。",
      "确认出行名单",
      { type: "warning", confirmButtonText: "确认名单", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  drawingId.value = row.id;
  try {
    const res = await http.post(`/admin/schedules/${row.id}/draw`);
    ElMessage.success(res.message || "出行名单已确认");
    await load();
  } catch (e) {
    ElMessage.error(e.message || "确认失败");
  } finally {
    drawingId.value = 0;
  }
}
async function review(row, status) {
  reviewing.value = { id: row.id, status };
  try {
    await http.post(`/admin/schedules/${row.id}/review`, { status });
    ElMessage.success(status === "approved" ? "已通过" : "已驳回");
    await load();
  } catch (e) {
    ElMessage.error(e.message || "审核失败");
  } finally {
    reviewing.value = { id: 0, status: "" };
  }
}
async function create() {
  const campus = neu.value.organizerType === "campus";
  const payload = {
    ...neu.value,
    studentOnly: campus ? neu.value.studentOnly : false,
    alumniOk: campus ? neu.value.alumniOk : false,
    oversub: campus ? neu.value.oversub : false,
    campusTargets: campus ? normalizeCampusTargets(neu.value.campusTargets) : [],
    genderRatio: campus ? genderRatioPayload(neu.value.genderRatio) : { on: false },
  };
  delete payload.schools;
  delete payload.colleges;
  const res = await http.post("/admin/schedules", payload);
  showNew.value = false;
  neu.value.virtualCount = 0;
  ElMessage.success(res.message || "已发布拼团");
  load();
}
</script>

<style scoped>
.checkin-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 0 0 12px;
}
</style>

