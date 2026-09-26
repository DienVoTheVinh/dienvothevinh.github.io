'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const read=p=>fs.readFileSync(p,'utf8'),blog=require('../js/blog-editorial.js');
const posts=JSON.parse(read('docs/blog/editorial-20260927.json'));
assert.equal(posts.length,3);assert.equal(new Set(posts.map(p=>p.id)).size,3);
for(const p of posts){assert.ok(fs.existsSync(p.cover_url));assert.ok(p.content.length>2500);assert.ok(p.title.length<80);assert.ok(p.excerpt);assert.ok(blog.card(p).includes('<h3>'));}
for(const bad of ['javascript:alert(1)','data:image/svg+xml,test','https://evil/" onerror="x','//evil/a','assets/\\evil'])assert.equal(blog.safeImage(bad),'');
const malicious=blog.card({id:'"',title:'<script>x</script>',excerpt:'<img onerror=x>',cover_url:'javascript:x'});assert.ok(!malicious.includes('<script>')&&!malicious.includes('<img'));
for(const p of ['index.html','blog.html']){const html=read(p);assert.match(html,/blog-editorial\.css/);assert.match(html,/blog-editorial\.js/);for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);}
// Exercise the actual shared menu for all roles, exam portals and hidden tenant menus.
const source=read('js/menu-v5.js'),nav={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
const noop=()=>{};const ctx={document:{querySelector:s=>s==='.navlinks'?nav:null,querySelectorAll:()=>[],getElementById:()=>({}),readyState:'loading',addEventListener:noop,body:{classList:{add:noop}},documentElement:{classList:{add:noop}}},window:{},location:{pathname:'/blog'},sessionStorage:{getItem:()=>null,removeItem:noop,setItem:noop},console};
vm.createContext(ctx);vm.runInContext(source,ctx);ctx.damBaoNutMenuMobile=noop;ctx.vmMenuSaveShell=noop;ctx.vmTenantFeatureState=()=> 'hidden';ctx.vmTenantFeatureConfig=()=>({state:'hidden'});
for(const role of ['admin','teacher','assistant','parent','student']){for(const tenant of [null,{full_site:true,features:[{feature_key:'exam_focus',state:'shown'}]}]){ctx.apDungMenu(role,null,tenant,{items:[]});assert.equal((nav.innerHTML.match(/href="blog"/g)||[]).length,1,role);assert.match(nav.innerHTML,/href="blog" class="active"/);}}
ctx.apDungMenu('student',{portal_only:true,portal:{slug:'test'},member_role:'student'},null,null);assert.match(nav.innerHTML,/href="blog"/);assert.match(source,/var allowed = \[[^\]]*'blog'/);
// Preserve equations, escape markup even inside math delimiters.
const page=read('blog.html'),renderer=page.slice(page.indexOf('function blogEsc'),page.indexOf('var MAU'));
const c={VMBlog:blog};vm.createContext(c);vm.runInContext(renderer,c);
assert.ok(c.renderBlog('$<img src=x onerror=alert(1)>$').includes('&lt;img'));
for(const p of posts){const html=c.renderBlog(p.content);assert.match(html,/<h2>/);assert.doesNotMatch(html,/undefined|<script/);}
assert.match(posts[2].content,/\\sqrt\{x\+2\}=x/);assert.match(posts[2].content,/nghiệm duy nhất là \$x=2\$/);
console.log('Blog: three articles/assets, escaping, math rendering, all five roles, tenant and exam menus passed.');
