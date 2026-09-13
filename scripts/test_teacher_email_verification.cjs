const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const {webcrypto}=require('node:crypto');
function fixture({configured=true,conflict=false,delivery=true,dbError=false}={}){
 const calls=[],mail=[],env=k=>configured?({RESEND_API_KEY:'test-key',VINHMATH_EMAIL_FROM:'test@example.test'}[k]):undefined;
 const db={auth:{admin:{listUsers:async p=>{calls.push({list:p});return {data:{users:conflict?[{id:'other',email:'teacher@example.test'}]:[]}};}}},rpc:async(name,args)=>{calls.push({name,args});return {data:'2026-09-13T04:00:00Z',error:dbError?{message:'Email đã thuộc tài khoản khác'}:null};},from(table){let record={table};const q={update(value){record.value=value;return q;},eq(k,v){record[k]=v;return q;},then(done){calls.push(record);return Promise.resolve({error:null}).then(done);}};return q;}};
 const send=async(url,options)=>{mail.push({url,...options,body:JSON.parse(options.body)});return {ok:delivery,json:async()=>({id:'mail-id'})};};
 const context={crypto:webcrypto,TextEncoder,Uint8Array,AbortSignal,fetch:send,Error};vm.createContext(context);
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/_shared/teacher-email.ts','utf8').replace(/export /g,'')),context);
 return {calls,mail,run:()=>context.requestTeacherEmail(db,'owner','teacher','teacher@example.test','Teacher',env,send),hash:context.tokenHash};
}
(async()=>{
 const missing=fixture({configured:false});await assert.rejects(missing.run,/Chưa cấu hình/);assert.equal(missing.calls.length,0);assert.equal(missing.mail.length,0);
 const duplicate=fixture({conflict:true});await assert.rejects(duplicate.run,/Email đã thuộc/);assert.equal(duplicate.calls.filter(c=>c.name).length,0);assert.equal(duplicate.mail.length,0);
 const dbFail=fixture({dbError:true});await assert.rejects(dbFail.run,/Email đã thuộc/);assert.equal(dbFail.mail.length,0);
 const failure=fixture({delivery:false});await assert.rejects(failure.run,/Chưa hoàn tất gửi/);assert.equal(failure.calls.at(-1).value.status,'failed');
 const ok=fixture(),result=await ok.run();assert.equal(result.pending,true);assert.equal(ok.calls.at(-1).value.status,'sent');assert.equal(ok.mail.length,1);
 const token=ok.mail[0].body.text.match(/xac-nhan-email#([a-f0-9]{64})/)[1];assert.equal(ok.calls.find(c=>c.name).args.p_hash,await ok.hash(token));assert.ok(!JSON.stringify(result).includes(token));assert.ok(!JSON.stringify(ok.calls).includes(token));assert.equal(ok.calls.filter(c=>c.name==='vm_teacher_link_email').length,0);
 assert.equal(ok.mail[0].body.to[0],'teacher@example.test');assert.ok(ok.mail[0].body.text.includes('30 phút'));
 // Validate anonymous proof endpoint: GET cannot consume, preview cannot write, invalid proofs cannot enumerate Auth.
 let handler,mutations=0,authReads=0;const ctx={crypto:webcrypto,TextEncoder,Uint8Array,AbortSignal,fetch:async()=>{},Response,Request,Date,JSON,Error,Deno:{env:{get:()=>''},serve:fn=>handler=fn}};
 const state={status:'sent',expires_at:new Date(Date.now()+60000).toISOString()};
 ctx.createClient=()=>({from(table){const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:table==='profiles'?{full_name:'Teacher'}:{user_id:'teacher',email:'teacher@example.test',...state}})};return q;},rpc:async()=>{mutations++;return {data:'account'};},auth:{admin:{listUsers:async()=>{authReads++;return {data:{users:[]}};}}}});
 vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/_shared/teacher-email.ts','utf8').replace(/export /g,''))+stripTypeScriptTypes(fs.readFileSync('supabase/functions/vinhmath-email-confirm/index.ts','utf8').replace(/^import .*;\r?\n/gm,'')),ctx);
 const req=(action,proof='a'.repeat(64))=>handler(new Request('https://server',{method:'POST',headers:{origin:'https://vinhmath.com'},body:JSON.stringify({action,token:proof})}));
 assert.equal((await handler(new Request('https://server'))).status,405);
 assert.equal((await req('confirm','bad')).status,400);assert.equal(authReads,0);
 assert.equal((await req('preview')).status,200);assert.equal(mutations,0);assert.equal(authReads,0);
 for(const status of ['sending','failed','cancelled']){state.status=status;assert.equal((await req('confirm')).status,400);}assert.equal(mutations,0);
 state.status='sent';state.expires_at=new Date(0).toISOString();assert.equal((await req('confirm')).status,400);assert.equal(mutations,0);
 state.expires_at=new Date(Date.now()+60000).toISOString();assert.equal((await req('confirm')).status,200);assert.equal(mutations,1);
 console.log('PASS email verification: missing configuration, conflicts, send failure, hash-only storage, no identity changes, explicit POST confirmation, invalid/expired/cancelled proofs');
})().catch(e=>{console.error(e);process.exitCode=1;});
