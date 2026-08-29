begin;

-- Profile.role is the authorization source during tenant cutovers.  A failed
-- cutover restores the previous Auth claim, which may intentionally differ
-- from the already-finalized profile role.  Never let that compensating Auth
-- update demote the profile; managed account factories finalize roles
-- explicitly after createUser returns.
drop trigger if exists on_auth_user_app_metadata_changed on auth.users;

commit;
