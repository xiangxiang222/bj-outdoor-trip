import { beforeEach, describe, expect, it, vi } from 'vitest';
import Mine from './Mine.vue';
import http from '@/api/http';

const fixture=vi.hoisted(()=>({
  router:{push:vi.fn()},
  store:{token:'account-a',profile:{nickname:'报名人'},fetchMe:vi.fn()},
  unmounts:[],
}));
vi.mock('vue',async importOriginal=>{
  const vue=await importOriginal();
  return {...vue,onMounted:vi.fn(),onUnmounted:fn=>fixture.unmounts.push(fn),watch:vi.fn(),useSSRContext:()=>({modules:new Set()})};
});
vi.mock('vue-router',()=>({useRouter:()=>fixture.router}));
vi.mock('@/stores/user',()=>({useUserStore:()=>fixture.store}));
vi.mock('@/api/http',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
const setup=()=>Mine.setup({}, {expose:vi.fn()});

describe('account summaries on return after enrollment',()=>{
  beforeEach(()=>{
    vi.clearAllMocks(); fixture.unmounts=[]; fixture.store.token='account-a';
    fixture.store.fetchMe.mockResolvedValue(undefined);
    vi.stubGlobal('document',{body:{style:{overflow:''}}});
  });
  it('fetches fresh order counts when the account page is opened again',async()=>{
    let count=0;
    http.get.mockImplementation(path=>Promise.resolve({data:path==='/me/wallet'?{unpaidCount:count,departCount:count}:[]}));
    const first=setup(); await first.load();
    expect(first.hub.value.unpaidCount).toBe(0);
    fixture.unmounts.forEach(fn=>fn());
    count=1;
    const returned=setup(); await returned.load();
    expect(returned.hub.value).toEqual({unpaidCount:1,departCount:1});
    expect(fixture.store.fetchMe).toHaveBeenCalledTimes(2);
    expect(http.get.mock.calls.filter(([path])=>path==='/me/wallet')).toHaveLength(2);
  });
  it('ignores responses from an unmounted page and an earlier account',async()=>{
    const pending=[];
    http.get.mockImplementation(path=>new Promise(resolve=>pending.push({path,resolve})));
    const state=setup(); const old=state.load();
    fixture.store.token='account-b'; const fresh=state.load();
    pending[2].resolve({data:[]}); pending[3].resolve({data:{unpaidCount:2}}); await fresh;
    pending[0].resolve({data:[]}); pending[1].resolve({data:{unpaidCount:99}}); await old;
    expect(state.hub.value.unpaidCount).toBe(2);
    const hidden=state.load(); fixture.unmounts.forEach(fn=>fn());
    pending[4].resolve({data:[]}); pending[5].resolve({data:{unpaidCount:88}}); await hidden;
    expect(state.hub.value.unpaidCount).toBe(2);
  });
  it('preserves the last account counts during a failed refresh',async()=>{
    http.get.mockImplementation(path=>Promise.resolve({data:path==='/me/wallet'?{unpaidCount:1}:[]}));
    const state=setup(); await state.load();
    http.get.mockRejectedValue(new Error('offline')); await state.load();
    expect(state.hub.value.unpaidCount).toBe(1); expect(state.hubReady.value).toBe(true);
  });
});
