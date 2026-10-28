"use strict";
const { assert, data, equal, denied, payload, save, storedTree, randomUUID } = require('./helpers.cjs');
module.exports = async function recovery(ctx) {
  const a = ctx.recoveryOwner, b = ctx.recoveryOther;
  const make = () => payload(ctx.strength,[{weight:60,reps:5},{weight:65,reps:4}]);
  const verify = async (body, id) => {
    const tree = await storedTree(ctx,a.id,body.client_save_id);
    equal(tree.rows.map(r=>r.id),[id],'Exactly one parent'); equal(tree.exercises.length,1,'Exactly one exercise'); equal(tree.sets.length,2,'Exactly two sets');
  };
  await ctx.run('recovery-before-send',async()=>{
    const body=make(); let intercepted=false;
    const client=await ctx.reconnect(a,{global:{fetch:async(input,init)=>{
      if(String(input).includes('/rpc/save_completed_workout_v2')) { intercepted=true; throw new TypeError('Injected disconnect before request'); }
      return fetch(input,init);
    }}});
    const failed=await client.rpc('save_completed_workout_v2',{p_workout:body,p_expected_user_id:a.id});
    assert.ok(intercepted && failed.error,'Network fault must be exercised');
    equal((await storedTree(ctx,a.id,body.client_save_id)).rows.length,0,'No write before send');
    await verify(body,await save(a,body));
  });
  await ctx.run('recovery-lost-response',async()=>{
    const body=make(); let committed=false;
    const client=await ctx.reconnect(a,{global:{fetch:async(input,init)=>{
      const response=await fetch(input,init);
      if(String(input).includes('/rpc/save_completed_workout_v2')) {
        assert.ok(response.ok,'Save must commit before injecting lost response');
        await response.text(); committed=true; throw new TypeError('Injected lost response after commit');
      }
      return response;
    }}});
    const failed=await client.rpc('save_completed_workout_v2',{p_workout:body,p_expected_user_id:a.id});
    assert.ok(committed && failed.error,'Committed response was discarded');
    const before=await storedTree(ctx,a.id,body.client_save_id); equal(before.rows.length,1,'Server committed despite lost response');
    const fresh=await ctx.reconnect(a); const id=await save(a,body,fresh); equal(id,before.rows[0].id,'Retry recovers committed ID'); await verify(body,id);
  });
  await ctx.run('recovery-concurrent',async()=>{
    const body=make();
    const results=await Promise.all(Array.from({length:8},()=>a.client.rpc('save_completed_workout_v2',{p_workout:body,p_expected_user_id:a.id})));
    const ids=results.map(r=>data(r,'Concurrent save must succeed'));
    equal(new Set(ids).size,1,'All simultaneous callers receive same ID'); await verify(body,ids[0]);
  });
  await ctx.run('recovery-restart',async()=>{
    const body=make(), id=await save(a,body);
    const serialized=JSON.stringify(body); const fresh=await ctx.reconnect(a);
    equal(await save(a,JSON.parse(serialized),fresh),id,'Persisted payload retry from new client'); await verify(body,id);
  });
  await ctx.run('recovery-account-switch',async()=>{
    const body=make(); const failed=await b.client.rpc('save_completed_workout_v2',{p_workout:body,p_expected_user_id:a.id});
    denied(failed,'Queued owner does not match active JWT');
    equal((await storedTree(ctx,a.id,body.client_save_id)).rows.length,0,'No A row');
    equal((await storedTree(ctx,b.id,body.client_save_id)).rows.length,0,'No B row');
    await verify(body,await save(a,body));
  });
  await ctx.run('recovery-shared-id',async()=>{
    const body=make(); const aid=await save(a,body), bid=await save(b,body);
    assert.notEqual(aid,bid,'Save IDs are scoped by authenticated owner');
    equal(data(await b.client.from('workout_history').select('id').eq('client_save_id',body.client_save_id),'B own read').map(r=>r.id),[bid],'B cannot receive A history');
    denied(await b.client.rpc('get_workout_history_detail',{p_workout_history_id:aid}),'Cross-account detail');
  });
  await ctx.run('recovery-rollback',async()=>{
    const body=make(), invalid=JSON.parse(JSON.stringify(body));
    invalid.exercise_history[0].sets[1].reps='invalid-number';
    const rejected=await a.client.rpc('save_completed_workout_v2',{p_workout:invalid,p_expected_user_id:a.id});
    assert.ok(rejected.error); equal(rejected.error.code,'22P02','Malformed numeric rejected');
    equal((await storedTree(ctx,a.id,body.client_save_id)).rows.length,0,'Failed save rolled back parent');
    await verify(body,await save(a,body));
  });
  const body=make(); const draft={draftId:body.client_save_id,userId:a.id,updatedAt:new Date().toISOString(),exercises:body.exercise_history};
  await ctx.run('draft-restore',async()=>{
    data(await a.client.from('live_workout_drafts').upsert({user_id:a.id,draft,updated_at:draft.updatedAt},{onConflict:'user_id'}),'Store server draft');
    const fresh=await ctx.reconnect(a);
    equal(data(await fresh.from('live_workout_drafts').select('draft').eq('user_id',a.id).single(),'Restore server draft').draft,draft,'Exact draft survives session replacement');
  });
  await ctx.run('draft-isolation',async()=>{
    equal(data(await b.client.from('live_workout_drafts').select('draft').eq('user_id',a.id),'Foreign draft read'),[],'No foreign draft readable');
    denied(await b.client.from('live_workout_drafts').upsert({user_id:a.id,draft:{draftId:randomUUID()}},{onConflict:'user_id'}),'Cannot overwrite foreign draft');
    equal(data(await b.client.from('live_workout_drafts').delete().eq('user_id',a.id).select('user_id'),'Foreign draft delete'),[],'Cannot delete foreign draft');
    denied(await a.client.from('live_workout_drafts').update({user_id:b.id}).eq('user_id',a.id),'Cannot transfer draft ownership');
    equal(data(await ctx.admin.from('live_workout_drafts').select('draft').eq('user_id',a.id).single(),'Original draft remains').draft,draft,'Other account did not modify draft');
  });
  await ctx.run('draft-completion',async()=>{
    const id=await save(a,body); const fresh=await ctx.reconnect(a);
    equal(data(await fresh.from('workout_history').select('id').eq('client_save_id',draft.draftId),'Completion lookup').map(r=>r.id),[id],'Reconnect can discover committed draft save');
    for(let i=0;i<2;i++) data(await fresh.from('live_workout_drafts').delete().eq('user_id',a.id),'Repeat safe draft clear');
    equal(data(await fresh.from('live_workout_drafts').select('draft').eq('user_id',a.id),'No stale server draft'),[],'Server draft removed');
  });
};
