begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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

select * from finish();
rollback;
