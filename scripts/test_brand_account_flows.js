// Exercise the actual Edge handler against an in-memory Auth/database adapter.
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const source = fs.readFileSync('supabase/functions/tao-tai-khoan/index.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
const code = stripTypeScriptTypes(source);
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
function fixture(mode = 'full_site') {
  const portal = { id:id(1), slug:'test', login_suffix:'hsum', teacher_login_suffix:'gvum', is_active:true, experience_mode:mode };
  const profiles = [{id:id(2),username:'teacher',role:'teacher'}, {id:id(3),username:'done',role:'student'}, {id:id(4),username:'new',role:'student'}];
  const members = profiles.slice(0,2).map(p => ({portal_id:portal.id,user_id:p.id,member_role:p.role==='teacher'?'manager':'student',portal_only:false,is_primary:true}));
  const auth = profiles.map(p => ({id:p.id,email:p.username+'@'+(p.id===id(2)?'gvum':p.id===id(3)?'hsum':'hs')+'.vinhmath.com',app_metadata:{vinhmath_role:p.role,keep:'private'},user_metadata:{keep:'public'}}));
  const tables = {vmtools_accounts:[{id:id(98),auth_user_id:id(99),role:'owner',status:'active'}],exam_portals:[portal],profiles,exam_portal_members:members,classes:[{id:id(5),teacher_id:id(2)}],class_students:[{class_id:id(5),student_id:id(3)},{class_id:id(5),student_id:id(4)}]};
  const state = {portal,profiles,members,auth,tables,writes:[],callerRole:'admin',failRpc:false,failMember:false,failAuthId:null,sequence:10};
  function query(table) {
    let filters=[],operation='read',payload,single=false;
    const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},update(v){operation='update';payload=v;return q;},insert(v){operation='insert';payload=v;return q;},then(resolve,reject){
      return Promise.resolve().then(()=>{
        let rows=(tables[table]||[]).filter(r=>filters.every(f=>f(r)));
        if(operation==='insert'){
          if(state.failMember&&table==='exam_portal_members')return {data:null,error:{message:'membership failed'}};
          const values=Array.isArray(payload)?payload:[payload]; tables[table].push(...structuredClone(values));rows=values;state.writes.push(['insert',table]);
        }
        if(operation==='update'){rows.forEach(r=>Object.assign(r,payload));state.writes.push(['update',table]);}
        return {data:single?rows[0]||null:rows,error:null};
      }).then(resolve,reject);
    }};return q;
  }
  const svc={from:query,auth:{admin:{
    async getUserById(userId){return {data:{user:structuredClone(auth.find(u=>u.id===userId))},error:null};},
    async listUsers(){return {data:{users:structuredClone(auth)},error:null};},
    async updateUserById(userId,values){
      state.writes.push(['auth',userId]);
      if(state.failAuthId===userId)return {data:{},error:{message:'rename failed'}};
      Object.assign(auth.find(u=>u.id===userId),structuredClone(values));return {data:{user:structuredClone(auth.find(u=>u.id===userId))},error:null};
    },
    async createUser(values){const user={id:id(state.sequence++),...structuredClone(values)};auth.push(user);profiles.push({id:user.id,username:user.email.split('@')[0],role:values.app_metadata.vinhmath_role});state.writes.push(['create',user.id]);return {data:{user},error:null};},
    async deleteUser(userId){for(const rows of [auth,profiles,members]){const i=rows.findIndex(r=>(r.id||r.user_id)===userId);if(i>=0)rows.splice(i,1);}state.writes.push(['delete',userId]);return {error:null};}
  }},async rpc(name,args){
    state.writes.push(['rpc',name]);
    if(state.failRpc)return {data:null,error:{message:'transaction failed'}};
    if(name==='vmtools_provision'){tables.vmtools_accounts.push({id:id(state.sequence++),auth_user_id:args.p_user,email:args.p_email,status:args.p_plan==='pending'?'pending':'active'});return {data:id(state.sequence-1),error:null};}
    for(const userId of [args.p_teacher_id,...args.p_student_ids]){
      members.filter(m=>m.user_id===userId).forEach(m=>m.is_primary=false);
      let row=members.find(m=>m.user_id===userId&&m.portal_id===portal.id);
      if(!row){row={user_id:userId,portal_id:portal.id};members.push(row);}
      Object.assign(row,{member_role:userId===args.p_teacher_id?'manager':'student',portal_only:false,is_primary:true});
    }portal.is_active=true;return {data:{ok:true},error:null};
  }};
  let handler;
  const caller={auth:{async getUser(){return {data:{user:state.callerRole?{id:id(99)}:null}};}}};
  // Caller profile lives separately from the cohort.
  profiles.push({id:id(99),username:'admin',role:'admin'});
  vm.runInNewContext(code,{Request,Response,createClient:(_url,key)=>key==='SUPABASE_SERVICE_ROLE_KEY'?svc:caller,Deno:{env:{get:k=>k},serve:fn=>handler=fn}});
  state.call=async body=>{profiles.find(p=>p.id===id(99)).role=state.callerRole;const r=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,...await r.json()};};
  state.migrate=dryRun=>state.call({type:'full_site_tenant_migrate',tenantId:portal.id,teacherId:id(2),classId:id(5),dryRun});
  return state;
}
(async()=>{
  for(const plan of ['pending','monthly']){
    const f=fixture(),created=await f.call({type:'gv',fullName:'Teacher QA',username:'teacherqa',email:'teacher@example.com',password:'test-only-password',vmtools:{plan,units:1,amount:0,until:null,confirmGrant:plan==='monthly',webEnabled:true}});
    assert.equal(created.status,200,JSON.stringify(created));assert.equal(created.account.login,'teacher@example.com');const license=f.tables.vmtools_accounts.find(a=>a.email==='teacher@example.com');assert.equal(license.auth_user_id,created.account.id);assert.equal(license.status,plan==='pending'?'pending':'active');
  }
  {const f=fixture();f.failRpc=true;const r=await f.call({type:'gv',fullName:'Teacher QA',username:'teacherqa',email:'teacher@example.com',password:'test-only-password',vmtools:{plan:'pending',units:1,amount:0}});assert.equal(r.status,500);assert.equal(f.auth.some(u=>u.email==='teacher@example.com'),false);}
  let s=fixture();let r=await s.migrate(true);
  assert.equal(r.status,200);assert.equal(r.preflight.skippedCount,2);assert.equal(r.preflight.changeCount,1);assert.equal(s.writes.length,0);
  r=await s.migrate(false);assert.equal(r.status,200);assert.deepEqual(s.writes.filter(w=>w[0]==='auth').map(w=>w[1]),[id(4)]);
  assert.equal(s.auth.find(u=>u.id===id(4)).email,'new@hsum.vinhmath.com');assert.equal(s.members.length,3);
  s.writes=[];r=await s.migrate(false);assert.equal(r.unchanged,true);assert.equal(r.preflight.skippedCount,3);assert.equal(s.writes.length,0);
  s=fixture();s.auth.push({id:id(40),email:'new@hsum.vinhmath.com'});r=await s.migrate(false);assert.equal(r.status,409);assert.equal(s.writes.length,0);
  s=fixture();s.failRpc=true;r=await s.migrate(false);assert.equal(r.rollbackOk,true);assert.equal(s.auth.find(u=>u.id===id(4)).email,'new@hs.vinhmath.com');assert.equal(s.members.length,2);
  assert.deepEqual(s.auth.find(u=>u.id===id(4)).app_metadata,{vinhmath_role:'student',keep:'private'});
  s=fixture();s.failAuthId=id(4);r=await s.migrate(false);assert.equal(r.status,409);assert.equal(s.members.length,2);
  for(const mode of ['full_site','exam_only'])for(const type of ['portal_hs','portal_gv']){
    s=fixture(mode);r=await s.call({type,portalId:id(1),fullName:'Test',username:'created',password:'test-only-password'});
    assert.equal(r.status,200);assert.equal(r.login,'created@'+(type==='portal_gv'?'gvum':'hsum'));
    const p=s.profiles.find(p=>p.username==='created'),m=s.members.find(m=>m.user_id===p.id);
    assert.equal(p.role,mode==='full_site'&&type==='portal_gv'?'teacher':'student');
    assert.equal(m.portal_only,mode==='exam_only');assert.equal(m.is_primary,mode==='full_site');
  }
  s=fixture();s.failMember=true;r=await s.call({type:'portal_hs',portalId:id(1),fullName:'Test',username:'created',password:'test-only-password'});assert.equal(r.rollbackOk,true);assert(!s.auth.some(u=>u.email.startsWith('created@')));
  for(const role of ['teacher','student',null]){
    s=fixture();s.callerRole=role;r=await s.migrate(false);assert.equal(r.status,role?403:401);assert.equal(s.writes.length,0);
    r=await s.call({type:'portal_gv',portalId:id(1),fullName:'Test',username:'created',password:'test-only-password'});assert.equal(r.status,role?403:401);assert.equal(s.writes.length,0);
  }
  s=fixture();s.portal.is_active=false;r=await s.call({type:'portal_hs',portalId:id(1),fullName:'Test',username:'created',password:'test-only-password'});assert.equal(r.status,404);assert.equal(s.writes.length,0);
  console.log('PASS actual Edge handler: mixed class, repeat no-op, collision, rollback, branded student/teacher, isolated exam manager, paused space and non-admin rejection');
})().catch(e=>{console.error(e);process.exitCode=1;});
