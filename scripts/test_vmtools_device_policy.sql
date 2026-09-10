-- Transactional regression checks: all fixture rows are rolled back.
begin;
do $$
declare student_id uuid; account_id uuid; owner_id uuid; key_prefix text:=gen_random_uuid()::text; blocked_ok boolean:=false;
begin
 select p.id into student_id from public.profiles p where p.role='student' and not exists(select 1 from public.vmtools_accounts a where a.auth_user_id=p.id) limit 1;
 if student_id is null then raise exception 'Student fixture identity unavailable'; end if;
 select id into owner_id from public.vmtools_accounts where role='owner' and status='active' limit 1;
 account_id:=public.vmtools_provision(owner_id,student_id,key_prefix||'@example.invalid','Transactional QA',true,'pending',1,null,0);
 if (select role from public.profiles where id=student_id)<>'student' then raise exception 'Student role changed'; end if;
 update public.vmtools_accounts set status='active',plan='lifetime',max_devices=1 where id=account_id;
 perform public.vmtools_register(account_id,key_prefix||'-mac','fixture','QA Mac','darwin');
 if (select status from public.vmtools_devices where key_hash=key_prefix||'-mac')<>'active' then raise exception 'Mac did not activate'; end if;
 perform public.vmtools_register(account_id,key_prefix||'-web','fixture','QA Browser','web');
 if (select status from public.vmtools_devices where key_hash=key_prefix||'-web')<>'active' then raise exception 'Web consumed desktop quota'; end if;
 perform public.vmtools_register(account_id,key_prefix||'-win','fixture','QA Windows','win32');
 if (select status from public.vmtools_devices where key_hash=key_prefix||'-win')<>'pending' then raise exception 'Quota bypassed'; end if;
 perform public.vmtools_device_status(owner_id,key_prefix||'-mac','blocked');
 perform public.vmtools_activate_device_if_allowed(key_prefix||'-mac');
 if (select status from public.vmtools_devices where key_hash=key_prefix||'-mac')<>'blocked' then raise exception 'Blocked device reactivated'; end if;
 update public.vmtools_accounts set auto_approve_devices=false where id=account_id;
 perform public.vmtools_activate_device_if_allowed(key_prefix||'-win');
 if (select status from public.vmtools_devices where key_hash=key_prefix||'-win')<>'pending' then raise exception 'Manual approval bypassed'; end if;
 begin perform public.vmtools_device_status(account_id,key_prefix||'-win','active'); exception when others then blocked_ok:=true; end;
 if not blocked_ok then raise exception 'Student approved own device'; end if;
 perform public.vmtools_device_status(owner_id,key_prefix||'-win','active');
 if (select status from public.vmtools_devices where key_hash=key_prefix||'-win')<>'active' then raise exception 'Owner review failed'; end if;
 update public.vmtools_accounts set status='blocked' where id=account_id;
 blocked_ok:=false;begin perform public.vmtools_register(account_id,key_prefix||'-new','fixture','Blocked','web'); exception when others then blocked_ok:=true; end;
 if not blocked_ok then raise exception 'Blocked account registered'; end if;
 if has_function_privilege('anon','public.vmtools_activate_device_if_allowed(text)','execute') or has_function_privilege('authenticated','public.vmtools_device_status(uuid,text,text)','execute') then raise exception 'Private RPC exposed'; end if;
 if has_table_privilege('anon','public.vmtools_devices','select') or has_table_privilege('authenticated','public.vmtools_accounts','update') then raise exception 'Private table exposed'; end if;
end$$;
rollback;
