begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Fixture users exist only inside this rolled-back test transaction.
insert into auth.users (id,email) values
 ('40000000-0000-4000-8000-000000000001','acl-a@test.local'),
 ('40000000-0000-4000-8000-000000000002','acl-b@test.local');
insert into public.profiles (id,name,email) values
 ('40000000-0000-4000-8000-000000000001','ACL A','acl-a@test.local'),
 ('40000000-0000-4000-8000-000000000002','ACL B','acl-b@test.local');

set local role authenticated;
set local request.jwt.claim.sub = '40000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.profiles), 1, 'authenticated user can see only their own profile');
select is((select count(*)::integer from public.profiles where id='40000000-0000-4000-8000-000000000002'), 0, 'user A cannot read user B profile');
select ok(not public.can_view_user('40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002'), 'cannot spoof viewer identity');
select is((select count(*)::integer from public.get_social_identities_v1(array['40000000-0000-4000-8000-000000000001'::uuid])), 1, 'own social identity available');
select is((select array_agg(k order by k) from public.get_social_identities_v1(array['40000000-0000-4000-8000-000000000001'::uuid]) s cross join lateral jsonb_object_keys(to_jsonb(s)) k), ARRAY['id','name','username']::text[], 'identity response has exactly three approved fields');
set local request.jwt.claim.sub='';
select is((select count(*)::integer from public.get_social_identities_v1(array['40000000-0000-4000-8000-000000000001'::uuid])), 0, 'missing JWT identity fails closed');
reset role;

select ok(not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_visible'), 'unrestricted profiles policy removed');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_own'), 'owner profile select policy retained');
select ok(not has_column_privilege('authenticated','public.profiles','role','INSERT'), 'client cannot insert admin profile role');
select ok(not has_column_privilege('authenticated','public.profiles','role','UPDATE'), 'client cannot escalate profile role');
select ok(has_column_privilege('authenticated','public.profiles','name','UPDATE'), 'client can still update own profile name');
select ok(not has_table_privilege('authenticated','public.profiles','TRUNCATE'), 'authenticated client cannot truncate profiles');
select ok(not has_table_privilege('anon','public.profiles','TRUNCATE'), 'anonymous client cannot truncate profiles');
select ok(not has_function_privilege('authenticated','public.admin_new_users(integer, integer)','EXECUTE'), 'legacy admin email listing not exposed to client');
select ok(has_function_privilege('service_role','public.admin_new_users(integer, integer)','EXECUTE'), 'trusted backend role retains administrative access');

select ok(not has_function_privilege('authenticated','public.rpc_progress_overview(uuid, text)','EXECUTE'), 'legacy cross-user progress RPC denied to client');
select ok(not has_function_privilege('authenticated','public.dev_delete_plan(uuid)','EXECUTE'), 'legacy arbitrary plan deletion RPC denied to client');

select ok(not has_function_privilege('anon','public.get_social_identities_v1(uuid[])','EXECUTE'), 'anonymous identity access denied');
select ok(not has_schema_privilege('anon','social_private','USAGE'), 'anonymous helper schema access denied');
select * from finish();
rollback;
