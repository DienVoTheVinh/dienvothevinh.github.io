import {createClient} from 'jsr:@supabase/supabase-js@2.95.0';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
async function q(p:any){const {data,error}=await p;if(error)throw Error(error.message);return data;}
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 if(origin&&['https://vinhmath.com','https://www.vinhmath.com'].includes(origin))headers['Access-Control-Allow-Origin']=origin;
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
 if(req.method!=='POST'||origin&&!headers['Access-Control-Allow-Origin'])throw Error('Yêu cầu không hợp lệ');
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,''),{data,error}=await db.auth.getUser(token);if(error||!data.user)return Response.json({error:'Cần đăng nhập quản trị'},{status:401,headers});
 const user=data.user,profile=await q(db.from('profiles').select('role').eq('id',user.id).maybeSingle()),owner=await q(db.from('vmtools_accounts').select('id').eq('auth_user_id',user.id).eq('role','owner').eq('status','active').maybeSingle());if(profile?.role!=='admin'||!owner)return Response.json({error:'Chỉ chủ sở hữu được phát hành'},{status:403,headers});
 const claims=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));if(!await q(db.rpc('vmtools_auth_session',{p_user:user.id,p_session:claims.session_id})))throw Error('Phiên đăng nhập đã kết thúc');
 const raw=await req.text();if(raw.length>16000)throw Error('Yêu cầu quá lớn');const p=JSON.parse(raw);
 if(p.action==='list')return Response.json({releases:await q(db.from('vmtools_releases').select('version,title,published,published_at,notes').order('published_at',{ascending:false}).limit(20))},{headers});
 if(!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(p.version))throw Error('Phiên bản không hợp lệ');
 const r=await q(db.from('vmtools_releases').select('*').eq('version',p.version).maybeSingle());
 if(p.action==='draft'){
 if(r)throw Error('Phiên bản đã tồn tại');if(typeof p.title!=='string'||p.title.length<1||p.title.length>100||typeof p.notes!=='string'||p.notes.length>4000)throw Error('Thông tin phát hành không hợp lệ');
 await q(db.from('vmtools_releases').insert({version:p.version,title:p.title,notes:p.notes,published:false,actor:owner.id,windows_url:'https://vinhmath.com/vmtool?tab=download&platform=win32',macos_url:'https://vinhmath.com/vmtool?tab=download&platform=darwin'}));return Response.json({ok:true},{headers});}
 if(!r||r.published)throw Error('Cần chọn bản nháp chưa công bố');
 if(p.action==='prepare'||p.action==='complete'){
 const f=p.file;if(!f||!['win32','darwin'].includes(f.platform)||!['x64','arm64'].includes(f.arch)||!['installer','update_manifest'].includes(f.kind)||!Number.isSafeInteger(f.size)||f.size<=0||f.size>1000000000||!/^VMTools-[a-zA-Z0-9._-]+$/.test(f.file_name)||!f.file_name.includes(p.version)||!(/^[a-f0-9]{64}$/).test(f.sha256))throw Error('Tệp phát hành không hợp lệ');
 if(f.kind==='installer'&&!f.file_name.endsWith(f.platform==='win32'?'.exe':'.dmg')||f.kind==='update_manifest'&&!f.file_name.endsWith('.vmupdate.json'))throw Error('Định dạng bộ cài không phù hợp');
 const path=p.version+'/'+f.file_name;
 if(p.action==='prepare')return Response.json(await q(db.storage.from('vmtools-releases').createSignedUploadUrl(path,{upsert:true})),{headers});
 const info=await q(db.storage.from('vmtools-releases').info(path));if(Number(info.size??info.metadata?.size)!==f.size)throw Error('Tệp tải lên chưa đủ dung lượng');
 await q(db.from('vmtools_release_files').upsert({version:p.version,platform:f.platform,arch:f.arch,kind:f.kind,file_name:f.file_name,size:f.size,sha256:f.sha256,notarized:f.notarized===true,storage_path:path},{onConflict:'version,platform,arch,kind'}));return Response.json({ok:true},{headers});}
 if(p.action==='publish'){
 if(p.confirm!==true)throw Error('Cần xác nhận công bố');
 const published=await q(db.from('vmtools_releases').select('version').eq('published',true));
 const parts=p.version.split('.').map(Number);
 if(published.some((old:any)=>{const a=old.version.split('.').map(Number);for(let i=0;i<3;i++){if(a[i]!==parts[i])return a[i]>parts[i];}return true;}))throw Error('Phiên bản mới phải cao hơn các bản đã công bố');
 const files=await q(db.from('vmtools_release_files').select('*').eq('version',p.version));
 if(!files.some((f:any)=>f.platform==='win32'&&f.kind==='installer'))throw Error('Chưa có bộ cài Windows');
 for(const f of files.filter((f:any)=>f.kind==='installer'))if(!files.some((m:any)=>m.platform===f.platform&&m.arch===f.arch&&m.kind==='update_manifest'))throw Error('Thiếu tệp xác minh cập nhật');
 await q(db.from('vmtools_releases').update({published:true,published_at:new Date().toISOString()}).eq('version',p.version));return Response.json({ok:true},{headers});}
 throw Error('Thao tác không hợp lệ');
 }catch(e){return Response.json({error:(e as Error).message},{status:400,headers});}
});
