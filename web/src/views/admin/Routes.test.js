import { beforeEach, describe, expect, it, vi } from 'vitest';
import Routes from './Routes.vue';
const fixture=vi.hoisted(()=>({route:{query:{}},router:{replace:vi.fn()}}));
vi.mock('vue',async importOriginal=>({...await importOriginal(),onMounted:vi.fn(),watch:vi.fn(),useSSRContext:()=>({modules:new Set()})}));
vi.mock('vue-router',()=>({useRoute:()=>fixture.route,useRouter:()=>fixture.router}));
vi.mock('@/api/http',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn(),delete:vi.fn()}}));
vi.mock('element-plus',()=>({ElMessage:{success:vi.fn(),error:vi.fn()},ElMessageBox:{confirm:vi.fn()}}));
const setup=()=>Routes.setup({}, {expose:vi.fn()});
const preferences=[
  {key:'coast',name:'海边',primary:true,status:'on',sortOrder:10,categories:['海滨'],tags:['海边']},
  {key:'family',name:'亲子',status:'on',sortOrder:20,categories:[],tags:['亲子']},
];

describe('admin route preference annotation and filtering',()=>{
  beforeEach(()=>{vi.clearAllMocks();fixture.route.query={};});
  it('previews matched preferences directly from the edited category and tags',()=>{
    const state=setup();state.preferences.value=preferences;state.form.value={category:'海滨',tags:['亲子']};
    expect(state.formPreferences.value.map(item=>item.key)).toEqual(['coast','family']);
    state.form.value.category='文化';expect(state.formPreferences.value.map(item=>item.key)).toEqual(['family']);
    state.form.value.tags=['亲子摄影'];expect(state.formPreferences.value).toEqual([]);
    expect(state.tagOptions.value).toContain('海边');
    expect(state.form.value).not.toHaveProperty('preference');
  });
  it('filters by configured preference alongside advanced management filters and clears its route query',()=>{
    const state=setup();state.preferences.value=preferences;
    state.rows.value=[{id:1,category:'海滨',tags:['亲子'],status:'on'},{id:2,category:'文化',tags:['亲子'],status:'on'},{id:3,category:'海滨',tags:[],status:'off'}];
    state.filters.preference='coast';state.filters.status='on';
    expect(state.list.value.map(row=>row.id)).toEqual([1]);expect(state.filtersOn.value).toBe(true);
    fixture.route.query={preference:'coast',review:'pending'};state.resetFilters();
    expect(state.list.value.map(row=>row.id)).toEqual([1,2,3]);expect(state.filtersOn.value).toBe(false);
    expect(fixture.router.replace).toHaveBeenCalledWith({path:'/admin/routes',query:{review:'pending'}});
  });
});
