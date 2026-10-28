"use strict";
const { assert, data, equal, denied, payload, save, rpc, createPost } = require('./helpers.cjs');
module.exports = async function privacy(ctx) {
  const { owner, follower, stranger } = ctx;
  const historyId = await save(owner, payload(ctx.strength, [{ weight: 50, reps: 5 }]));
  const posts = {};
  for (const visibility of ['public', 'followers', 'private']) {
    posts[visibility] = await createPost(owner, historyId, visibility);
    await rpc(owner.client, 'add_post_comment', { p_post_id: posts[visibility], p_body: 'Owner comment' });
  }
  ctx.socialPosts = posts;
  const visibility = async value => data(await ctx.admin.from('profiles').update({ visibility: value }).eq('id',owner.id), 'Set isolated profile visibility');
  async function check(viewer, canView, following, blocked = false) {
    const self = viewer.id === owner.id;
    const allowed = Object.keys(posts).filter(v => self || (canView && (v === 'public' || (v === 'followers' && following))));
    const allowedIds = allowed.map(v=>posts[v]).sort();
    equal(await rpc(viewer.client, 'can_view_user', { p_viewer: viewer.id, p_profile_id: owner.id }), canView, 'Profile visibility gate');
    const raw = data(await viewer.client.from('profiles').select('id,email,settings').eq('id',owner.id), 'Raw profiles table');
    equal(raw.length, self ? 1 : 0, 'Other accounts never receive raw private profile fields');
    const identities = await rpc(viewer.client, 'get_social_identities_v1', { p_user_ids: [owner.id] });
    equal(identities.length, canView ? 1 : 0, 'Identity RPC visibility');
    for (const row of identities) equal(Object.keys(row).sort(), ['id','name','username'], 'Identity allowlist');
    for (const endpoint of ['get_profile_overview_v1', 'get_profile_card_v1']) {
      const cards = await rpc(viewer.client, endpoint, { p_profile_id: owner.id });
      equal(cards.length, blocked ? 0 : 1, endpoint + ' block gate');
      if (!cards.length) continue;
      const card = cards[0]; equal(card.can_view, canView, endpoint + ' content gate');
      for (const key of ['email','settings','dob','weight','height','role']) assert.ok(!(key in card), endpoint + ' exposed ' + key);
      if (!canView) {
        equal(card.workouts_completed, null, 'Restricted card hides workout count');
        equal(card.followers_count, null, 'Restricted card hides follower count');
        equal(card.following_count, null, 'Restricted card hides following count');
      }
      equal(card.recent_posts.map(p=>p.post_id).sort(), allowedIds, endpoint + ' post audience');
    }
    const feed = await rpc(viewer.client,'get_feed',{p_limit:100});
    equal(feed.filter(p=>p.user_id===owner.id).map(p=>p.post_id).sort(),allowedIds,'Feed audience');
    equal((await rpc(viewer.client,'get_user_posts_v1',{p_user_id:owner.id,p_limit:100})).map(p=>p.post_id).sort(),allowedIds,'User post list audience');
    equal(data(await viewer.client.from('posts').select('id').eq('user_id',owner.id),'Direct posts RLS').map(p=>p.id).sort(),allowedIds,'Direct posts audience');
    for (const [audience,id] of Object.entries(posts)) {
      const visible = allowed.includes(audience);
      equal((await rpc(viewer.client,'get_post_detail_v1',{p_post_id:id})).length,visible?1:0,'Detail '+audience);
      equal((await rpc(viewer.client,'get_post_workout_details',{p_post_id:id})).length,visible?1:0,'Linked workout '+audience);
      const comments = await viewer.client.rpc('get_post_comments',{p_post_id:id});
      if (visible) assert.ok(data(comments,'Read allowed comments').some(c=>c.body==='Owner comment'));
      else {
        denied(comments,'Hidden comments');
        denied(await viewer.client.rpc('add_post_comment',{p_post_id:id,p_body:'Must not save'}),'Hidden comment mutation');
        denied(await viewer.client.rpc('toggle_post_like',{p_post_id:id}),'Hidden like mutation');
      }
    }
  }
  await ctx.run('privacy-public-owner',()=>check(owner,true,true));
  await ctx.run('privacy-public-stranger',()=>check(stranger,true,false));
  await rpc(follower.client,'request_follow',{p_target:owner.id});
  await ctx.run('privacy-public-follower',()=>check(follower,true,true));
  await visibility('followers');
  await ctx.run('privacy-followers-stranger',()=>check(stranger,false,false));
  await ctx.run('privacy-followers-follower',()=>check(follower,true,true));
  await visibility('private');
  await ctx.run('privacy-private-follower',()=>check(follower,false,true));
  await ctx.run('privacy-pending',async()=>{
    equal(await rpc(stranger.client,'request_follow',{p_target:owner.id}),'requested','Private follow requires approval');
    await check(stranger,false,false);
  });
  await ctx.run('privacy-accepted',async()=>{
    await rpc(owner.client,'accept_follow_request',{p_requester:stranger.id});
    const edge=data(await ctx.admin.from('user_follows').select('follower_id').eq('follower_id',stranger.id).eq('followee_id',owner.id),'Accepted edge');
    equal(edge.length,1,'Accepted request creates follow edge');
    await check(stranger,false,true);
  });
  await visibility('followers');
  await ctx.run('privacy-accepted-followers',()=>check(stranger,true,true));
  await ctx.run('privacy-unfollow',async()=>{ await rpc(stranger.client,'unfollow',{p_target:owner.id}); await check(stranger,false,false); });
  await ctx.run('privacy-forged-viewer',async()=>{
    equal(await rpc(stranger.client,'can_view_user',{p_viewer:owner.id,p_profile_id:owner.id}),false,'Forged visibility identity is denied');
  });
  await ctx.run('privacy-cross-owner-writes',async()=>{
    equal(data(await stranger.client.from('posts').update({caption:'Intruder'}).eq('id',posts.public).select('id'),'Foreign post update'),[],'No foreign post updated');
    equal(data(await stranger.client.from('posts').delete().eq('id',posts.public).select('id'),'Foreign post delete'),[],'No foreign post deleted');
    equal(data(await stranger.client.from('workout_history').delete().eq('id',historyId).select('id'),'Foreign history delete'),[],'No foreign history deleted');
    denied(await stranger.client.rpc('get_workout_history_detail',{p_workout_history_id:historyId}),'Private history detail denied');
    equal(data(await ctx.admin.from('posts').select('caption').eq('id',posts.public).single(),'Verify unchanged post').caption,'Backend public','Foreign writes had no effect');
  });
  await visibility('public');
  await ctx.run('privacy-block-owner',async()=>{ await rpc(owner.client,'block_user',{p_target:follower.id}); await check(follower,false,false,true); });
  await ctx.run('privacy-block-viewer',async()=>{ await rpc(stranger.client,'block_user',{p_target:owner.id}); await check(stranger,false,false,true); });
};
