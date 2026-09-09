import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linkedPasswordLogin} from '../supabase/functions/vmtools-license/login.ts';
const input={email:' Owner@Example.com ',password:'existing-password-fixture'};
function fixture(overrides={}){return {
 account:async email=>{assert.equal(email,'owner@example.com');return {auth_user_id:'linked-id',status:'active'};},
 identity:async id=>{assert.equal(id,'linked-id');return {email:'legacy@ad.example.com'};},
 signIn:async(email,password)=>{assert.equal(email,'legacy@ad.example.com');assert.equal(password,input.password);return {data:{user:{id:'linked-id'},session:{access_token:'verified-fixture'}}};},...overrides};}
test('contact email uses the existing linked Auth identity and unchanged password',async()=>{assert.equal(await linkedPasswordLogin(input,fixture()),'verified-fixture');});
test('wrong password, missing link, mismatched identity and blocked account never register',async()=>{
 for(const services of [fixture({signIn:async()=>({error:{message:'internal detail'}})}),fixture({account:async()=>null,signIn:async()=>({data:{user:{id:'other'},session:{access_token:'token'}}})}),fixture({signIn:async()=>({data:{user:{id:'other'},session:{access_token:'token'}}})}),fixture({account:async()=>({auth_user_id:'linked-id',status:'blocked'})})])await assert.rejects(linkedPasswordLogin(input,services),/không đúng|đã bị khóa/);
});
test('invalid inputs are rejected before any account lookup',async()=>{for(const bad of [{email:null,password:'x'},{email:'bad',password:'x'},{email:'a@b.com',password:''},{email:'a@b.com',password:'x'.repeat(129)}])await assert.rejects(linkedPasswordLogin(bad,{account:()=>assert.fail()}),/không đúng/);});
