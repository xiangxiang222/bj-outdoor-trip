import { beforeEach, describe, expect, it, vi } from 'vitest';
import Orders from './Orders.vue';
import http from '@/api/http';
const fixture = vi.hoisted(() => ({ router:{push:vi.fn(),replace:vi.fn()},route:{query:{tab:'all'}},store:{token:'account-a'} }));
vi.mock('vue', async importOriginal => {
  const vue=await importOriginal();
  return {...vue,onMounted:vi.fn(),onUnmounted:vi.fn(),watch:vi.fn(),useSSRContext:()=>({modules:new Set()})};
});
vi.mock('vue-router',()=>({useRoute:()=>fixture.route,useRouter:()=>fixture.router}));
vi.mock('@/stores/user',()=>({useUserStore:()=>fixture.store}));
vi.mock('@/api/http',()=>({default:{get:vi.fn(),post:vi.fn()}}));
const setup=()=>Orders.setup({}, {expose:vi.fn()});
const rows=[
  {id:1,status:'joined',channel:'trip',schedule_status:'confirmed',pay_status:'paid',pay_amount:40,start_date:'2099-11-01',created_at:'2026-10-01'},
  {id:2,status:'joined',channel:'activity',category:'掼蛋',pay_status:'unpaid',pay_amount:30,start_date:'2099-11-01',created_at:'2026-09-01',route_id:9},
  {id:3,status:'joined',channel:'activity',category:'掼蛋',pay_status:'paid',pay_amount:30,start_date:'2020-11-01',created_at:'2020-10-01',route_id:9},
];
describe('journey state and enrollment-time filters',()=>{
  beforeEach(()=>{vi.clearAllMocks();fixture.route.query={tab:'all'};fixture.store.token='account-a';vi.stubGlobal('document',{querySelector:()=>null});});
  it('defaults a plain journey entry to every status and fetches new enrollments when revisited',async()=>{
    fixture.route.query={};
    let current=[];
    http.get.mockImplementation(()=>Promise.resolve({data:current}));
    const first=setup(); await first.load();
    expect(first.tab.value).toBe('all'); expect(first.shown.value).toEqual([]);
    current=rows;
    const returned=setup(); await returned.load();
    expect(returned.tab.value).toBe('all'); expect(returned.shown.value.map(row=>row.id)).toEqual([1,2,3]);
    expect(http.get).toHaveBeenCalledTimes(2);
  });
  it('preserves existing orders when a refresh fails',async()=>{
    http.get.mockResolvedValueOnce({data:rows}).mockRejectedValueOnce(new Error('offline'));
    const state=setup(); await state.load(); await state.load();
    expect(state.list.value).toEqual(rows); expect(state.loadError.value).toBe(true);
  });
  it('applies a status directly from the sheet and keeps it outside the sheet',()=>{
    const state=setup(); state.list.value=rows; state.openFilter();
    state.setFilterTab('unpaid');
    expect(state.tab.value).toBe('unpaid'); expect(state.shown.value.map(row=>row.id)).toEqual([2]);
    state.sheet.value=false; state.openFilter(); expect(state.draftTab.value).toBe('unpaid');
    state.setFilterTab('ended'); expect(state.shown.value.map(row=>row.id)).toEqual([3]);
  });
  it('selects cancelled journeys from the sheet, keeps the extra tab and combines search and enrollment dates',()=>{
    const cancelled=[
      {...rows[0],id:4,title:'长城',status:'cancelled'},
      {...rows[0],id:5,title:'长城',schedule_status:'cancelled',created_at:'2020-10-01'},
      {...rows[0],id:6,title:'海滨',status:'cancelled'},
    ];
    const state=setup(); state.list.value=[...rows,...cancelled]; state.openFilter();
    expect(state.allStatusTabs.some(item=>item.key==='cancelled' && item.label==='已取消')).toBe(true);
    state.setFilterTab('cancelled');
    expect(state.shown.value.map(row=>row.id)).toEqual([4,5,6]);
    expect(state.selectedStatus.value).toBe('已取消');
    expect(state.tabCount('cancelled')).toBe(3);
    expect(state.statusTabs.value.at(-1).key).toBe('cancelled');
    state.sheet.value=false; state.openFilter(); expect(state.draftTab.value).toBe('cancelled');
    state.keyword.value='长城'; state.draft.value={preset:'',start:'2026-10-01',end:'2026-10-31'}; state.commitTime();
    expect(state.shown.value.map(row=>row.id)).toEqual([4]);
    state.clearFilters();
    expect(state.tab.value).toBe('all'); expect(state.keyword.value).toBe(''); expect(state.shown.value).toHaveLength(6);
  });
  it('honors a cancelled journey deep link without falling back to all statuses',async()=>{
    fixture.route.query={tab:'cancelled'};
    http.get.mockResolvedValue({data:[...rows,{...rows[0],id:4,status:'cancelled'}]});
    const state=setup(); await state.load();
    expect(state.tab.value).toBe('cancelled');
    expect(state.shown.value.map(row=>row.id)).toEqual([4]);
    expect(state.selectedStatus.value).toBe('已取消');
  });
  it('applies valid date changes immediately, keeping the last valid filter during an invalid edit',()=>{
    const state=setup(); state.list.value=rows; state.openFilter();
    state.draft.value.start='2026-10-01'; state.commitTime();
    expect(state.shown.value.map(row=>row.id)).toEqual([1]);
    state.sheet.value=false; state.openFilter(); expect(state.draft.value.start).toBe('2026-10-01');
    state.draft.value.end='2026-09-01'; state.applyFilter();
    expect(state.sheet.value).toBe(true); expect(state.filterError.value).toBe('起始时间不能晚于终止时间'); expect(state.applied.value.end).toBe('');
    state.draft.value.end='2026-10-31'; state.applyFilter(); expect(state.sheet.value).toBe(false); expect(state.applied.value.end).toBe('2026-10-31');
    state.clearTime(); expect(state.shown.value).toHaveLength(3);
  });
  it('resets both status and time immediately and blocks activity route navigation',()=>{
    const state=setup(); state.list.value=rows; state.tab.value='ended'; state.applied.value={preset:'2020',start:'',end:''}; state.openFilter();
    state.resetDraft(); state.sheet.value=false; expect(state.shown.value).toHaveLength(3); expect(state.tab.value).toBe('all');
    state.again(rows[2]); expect(fixture.router.push).not.toHaveBeenCalled();
    state.again({...rows[2],channel:'trip',schedule_status:'finished'}); expect(fixture.router.push).toHaveBeenCalledWith('/m/route/9');
  });
});
