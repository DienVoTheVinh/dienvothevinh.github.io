const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync('supabase/functions/vinhmath-services-admin/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
const token='x.'+Buffer.from(JSON.stringify({session_id:'session'})).toString('base64url')+'.x';
function fixture(role='admin'){
 const calls=[],state={role,session:true},tables={profiles:[{id:'admin',role},{id:'teacher',role:'teacher'}],vmtools_accounts:[{id:'owner',auth_user_id:'admin',role:'owner',status:'active'},{id:'license',auth_user_id:'teacher',role:'user',status:'active',features:['ink'],name:'GV',max_devices:1,offline_days:2,web_enabled:true}]};let handler;
 const db={auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null})},from(table){let filters=[],one=false;const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},single(){one=true;return q;},maybeSingle(){one=true;return q;},order(){return q;},limit(){return q;},update(p){calls.push({table,p});return q;},upsert(p){calls.push({table,p});return q;},then(resolve){const rows=(tables[table]||[]).filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:one?rows[0]||null:rows,error:null}).then(resolve);}};return q;},rpc:async(name,args)=>{calls.push({name,args});return {data:name==='vmtools_auth_session'?state.session:'2027-01-01',error:null};}};
 vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/_shared/vmtools-access.ts','utf8').replace(/export /g,''))+stripTypeScriptTypes(source),{createClient:()=>db,Deno:{env:{get:()=>''},serve:fn=>handler=fn},Response,Request,Error,JSON,Date,Number,atob});
 return {state,calls,request:p=>handler(new Request('https://server',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(p)}))};
}
(async()=>{
 const teacher=fixture('teacher');assert.equal((await teacher.request({action:'list'})).status,403);assert.equal(teacher.calls.length,0);
 const ended=fixture();ended.state.session=false;assert.equal((await ended.request({action:'list'})).status,400);
 for(const service of ['classroom','vmtools']){
  const f=fixture(),r=await f.request({action:'renew',service,userId:'teacher',plan:'monthly',units:1,amount:0,note:'Test',requestId:'request',confirm:true});assert.equal(r.status,200);
  const writes=f.calls.filter(x=>x.name&&x.name!=='vmtools_auth_session');assert.equal(writes.length,1);assert.equal(writes[0].name,service==='classroom'?'teacher_service_renew':'vmtools_renew');assert.equal(writes[0].args.p_actor,service==='classroom'?'admin':'owner');
 }
 const invalid=fixture();assert.equal((await invalid.request({action:'renew',service:'anything',userId:'teacher'})).status,400);
 const unaffirmed=fixture();assert.equal((await unaffirmed.request({action:'renew',service:'vmtools',userId:'teacher',plan:'monthly',units:1,amount:0,note:''})).status,400);
 const status=fixture();assert.equal((await status.request({action:'status',service:'classroom',userId:'teacher',status:'blocked'})).status,200);assert.deepEqual(status.calls.filter(x=>x.table).map(x=>x.table),['teacher_service_accounts']);
 const permissions=fixture();let r=await permissions.request({action:'permissions',service:'vmtools',userId:'teacher',appEnabled:false,webEnabled:true,downloadEnabled:false,features:['geometry2d']});assert.equal(r.status,200);assert.deepEqual(permissions.calls.filter(x=>x.table).map(x=>x.table),['vmtools_accounts']);assert.equal(permissions.calls.find(x=>x.table).p.app_enabled,false);
 const badFeature=fixture();assert.equal((await badFeature.request({action:'permissions',service:'vmtools',userId:'teacher',appEnabled:true,webEnabled:true,downloadEnabled:true,features:['admin']})).status,400);assert.equal(badFeature.calls.filter(x=>x.table).length,0);
 console.log('PASS admin-only services; session revocation; independent renewal routing; confirmation; no identity/class writes');
})().catch(e=>{console.error(e);process.exitCode=1;});
