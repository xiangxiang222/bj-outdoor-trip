import { beforeEach, describe, expect, it, vi } from 'vitest';
import Tags from './Tags.vue';
import http from '@/api/http';
import { ElMessageBox } from 'element-plus';
import { onBeforeUnmount } from 'vue';

vi.mock('vue', async importOriginal => ({ ...await importOriginal(), onMounted:vi.fn(), onBeforeUnmount:vi.fn(), useSSRContext:()=>({modules:new Set()}) }));
vi.mock('@/api/http',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn(),delete:vi.fn()}}));
vi.mock('element-plus',()=>({ElMessage:{success:vi.fn(),error:vi.fn()},ElMessageBox:{confirm:vi.fn()}}));
const initial = { key:'hiking', name:'徒步登山', primary:true, sortOrder:20, status:'on', categories:['登山'], tags:['徒步'], count:8 };
const setup=()=>Tags.setup({}, {expose:vi.fn()});
const operator=()=>{const state=setup();state.me.value={role:'operator'};return state;};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

describe('admin route preference configuration',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    http.get.mockResolvedValue({data:[initial]});
    http.post.mockResolvedValue({data:initial});
    http.put.mockResolvedValue({data:initial});
    http.delete.mockResolvedValue({data:initial});
    ElMessageBox.confirm.mockResolvedValue('confirm');
  });
  it('creates a preference with explicit independent rules and normalizes only input whitespace and duplicates',async()=>{
    const state=operator();state.openPreference();
    Object.assign(state.preferenceForm.value,{key:' family_walk ',name:' 亲子漫步 ',categories:['登山',' 登山 '],tags:['亲子','亲子']});
    await state.savePreference();
    expect(http.post).toHaveBeenCalledWith('/admin/route-preferences',{key:'family_walk',name:'亲子漫步',primary:false,sortOrder:100,status:'on',categories:['登山'],tags:['亲子']});
    expect(state.preferenceShow.value).toBe(false);
    expect(http.get).toHaveBeenCalledWith('/admin/route-preferences');
  });
  it('edits by stable key without mutating the loaded rule or submitting its count',async()=>{
    const state=operator();state.editPreference(initial);
    state.preferenceForm.value.key='changed';state.preferenceForm.value.tags.push('摄影');
    expect(initial.tags).toEqual(['徒步']);
    await state.savePreference();
    expect(http.put).toHaveBeenCalledWith('/admin/route-preferences/hiking',expect.objectContaining({key:'hiking',tags:['徒步','摄影']}));
    expect(http.put.mock.calls[0][1]).not.toHaveProperty('count');
  });
  it('keeps failed edits available for correction and rejects empty matching rules before writing',async()=>{
    const state=operator();state.openPreference();
    Object.assign(state.preferenceForm.value,{key:'family',name:'亲子'});
    await state.savePreference();expect(http.post).not.toHaveBeenCalled();expect(state.preferenceFormError.value).toContain('至少选择');
    state.preferenceForm.value.tags=['亲子'];http.post.mockRejectedValueOnce(new Error('标识已存在'));
    await state.savePreference();expect(state.preferenceShow.value).toBe(true);expect(state.preferenceFormError.value).toBe('标识已存在');expect(state.savingPreference.value).toBe(false);
  });
  it('soft disables after confirmation and re-enables with a partial status update',async()=>{
    const state=operator();await state.togglePreference(initial);
    expect(ElMessageBox.confirm).toHaveBeenCalledOnce();expect(http.delete).toHaveBeenCalledWith('/admin/route-preferences/hiking');
    await state.togglePreference({...initial,status:'off'});
    expect(http.put).toHaveBeenCalledWith('/admin/route-preferences/hiking',{status:'on'});
    ElMessageBox.confirm.mockRejectedValueOnce('cancel');http.delete.mockClear();
    await state.togglePreference(initial);expect(http.delete).not.toHaveBeenCalled();
  });
  it('allows roster viewers to read rules while preventing write actions',async()=>{
    const state=setup();state.me.value={role:'leader'};
    await state.loadPreferences();expect(state.preferences.value).toHaveLength(1);
    state.openPreference();state.editPreference(initial);await state.savePreference();await state.togglePreference(initial);
    expect(state.preferenceShow.value).toBe(false);expect(http.post).not.toHaveBeenCalled();expect(http.put).not.toHaveBeenCalled();expect(http.delete).not.toHaveBeenCalled();
  });
  it('keeps the save refresh loading until its own response and ignores the older refresh result',async()=>{
    const state=operator(),old=deferred(),fresh=deferred();
    http.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const oldLoad=state.loadPreferences();state.editPreference(initial);state.preferenceForm.value.name='新的显示名称';
    const save=state.savePreference();await Promise.resolve();
    expect(http.get).toHaveBeenCalledTimes(2);
    old.resolve({data:[initial]});await oldLoad;
    expect(state.preferenceLoading.value).toBe(true);expect(state.preferences.value).toEqual([]);
    fresh.resolve({data:[{...initial,name:'新的显示名称'}]});await save;
    expect(state.preferenceLoading.value).toBe(false);expect(state.preferences.value[0].name).toBe('新的显示名称');
  });
  it('ignores an old preference failure after a newer refresh succeeds',async()=>{
    const state=operator(),old=deferred();http.get.mockReturnValueOnce(old.promise);
    const oldLoad=state.loadPreferences();await state.loadPreferences();
    old.reject(new Error('旧请求失败'));await oldLoad;
    expect(state.preferences.value).toEqual([initial]);expect(state.preferenceError.value).toBe('');expect(state.preferenceLoading.value).toBe(false);
  });
  it('keeps only the latest trip tag response and stops all loaders from updating after unmount',async()=>{
    const state=operator(),oldTags=deferred();http.get.mockReturnValueOnce(oldTags.promise).mockResolvedValueOnce({data:[{id:2,name:'新标签'}]});
    const oldLoad=state.loadTags();await state.loadTags();oldTags.resolve({data:[{id:1,name:'旧标签'}]});await oldLoad;
    expect(state.list.value).toEqual([{id:2,name:'新标签'}]);
    const preferences=deferred(),tags=deferred();http.get.mockReturnValueOnce(preferences.promise).mockReturnValueOnce(tags.promise);
    const pending=[state.loadPreferences(),state.loadTags()];onBeforeUnmount.mock.calls.at(-1)[0]();
    preferences.resolve({data:[initial]});tags.reject(new Error('卸载后失败'));await Promise.all(pending);
    expect(state.preferences.value).toEqual([]);expect(state.list.value).toEqual([{id:2,name:'新标签'}]);expect(state.preferenceError.value).toBe('');expect(state.tagError.value).toBe('');
    expect(state.preferenceLoading.value).toBe(true);expect(state.loading.value).toBe(true);
    const calls=http.get.mock.calls.length;await state.loadPreferences();await state.loadTags();expect(http.get).toHaveBeenCalledTimes(calls);
  });
});
