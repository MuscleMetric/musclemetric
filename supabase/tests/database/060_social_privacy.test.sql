begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id,email) values
 ('20000000-0000-4000-8000-000000000001','social-a@test.local'),
 ('20000000-0000-4000-8000-000000000002','social-b@test.local'),
 ('20000000-0000-4000-8000-000000000003','social-c@test.local');
insert into public.profiles (id,name,email,visibility) values
 ('20000000-0000-4000-8000-000000000001','Social A','social-a@test.local','public'),
 ('20000000-0000-4000-8000-000000000002','Social B','social-b@test.local','followers'),
 ('20000000-0000-4000-8000-000000000003','Social C','social-c@test.local','private');

set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
select ok(public.can_view_user('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),'self is always viewable');
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000002';
select ok(public.can_view_user('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001'),'public profile is viewable');
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
select ok(not public.can_view_user('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'),'followers profile hidden before follow');
select ok(not public.can_view_user('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003'),'private profile hidden');

set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';

select is(public.request_follow('20000000-0000-4000-8000-000000000002'),'following','followers visibility follows immediately');
select ok(public.can_view_user('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'),'follow grants followers-profile visibility');
select is(public.request_follow('20000000-0000-4000-8000-000000000003'),'requested','private profile requires request');
select is(
 (select status from public.follow_requests where requester_id='20000000-0000-4000-8000-000000000001' and target_id='20000000-0000-4000-8000-000000000003'),
 'pending','private follow request remains pending'
);

select lives_ok($$ select public.block_user('20000000-0000-4000-8000-000000000002') $$,'user can block another user');
select ok(not public.can_view_user('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'),'block prevents profile visibility');
select is(
 (select count(*) from public.user_follows where follower_id='20000000-0000-4000-8000-000000000001' and followee_id='20000000-0000-4000-8000-000000000002'),
 0::bigint,'blocking removes existing follow edge'
);

select * from finish();
rollback;
