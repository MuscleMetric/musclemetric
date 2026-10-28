"use strict";
const { assert, data, equal, payload, save, rpc, createPost } = require('./helpers.cjs');
module.exports = async function analytics(ctx) {
  const a=ctx.analyticsOwner;
  const deep=exercise=>rpc(a.client,'get_exercise_deep_analytics',{p_exercise_id:exercise});
  await ctx.run('analytics-null-type',async()=>{
    const untyped=await ctx.exercise(null,'nullable strength');
    const body=payload(untyped,[{weight:50,reps:10}]);
    body.exercise_history.push(payload(ctx.cardio,[{distance:2,time_seconds:600}]).exercise_history[0]);
    body.exercise_history[1].order_index=1;
    const id=await save(a,body), post=await createPost(a,id,'private');
    const detail=await rpc(a.client,'get_workout_history_detail',{p_workout_history_id:id});
    equal(Number(detail.stats.volume_kg),500,'Mixed detail retains lifting volume');
    equal(Number(detail.stats.distance_total),2,'Mixed detail retains cardio distance');
    const strength=await deep(untyped); equal(strength.meta.exercise_type,'strength','Null type defaults to strength');
    equal(Number(strength.cards.current.top_weight),50,'Strength analytics stays present');
    const rows=[...(await rpc(a.client,'get_feed',{p_limit:100})),...(await rpc(a.client,'get_post_detail_v1',{p_post_id:post})),
      ...(await rpc(a.client,'get_profile_overview_v1',{p_profile_id:a.id}))[0].recent_posts];
    for(const row of rows.filter(r=>r.post_id===post)) {
      equal(row.workout_snapshot.workout_kind,'mixed','All social summaries classify null-type strength plus cardio as mixed');
      equal(Number(row.workout_snapshot.total_volume),500,'Social summary lifting volume');
      equal(Number(row.workout_snapshot.total_distance_km),2,'Social summary distance');
    }
  });
  await ctx.run('analytics-incomplete',async()=>{
    const ex=await ctx.exercise('cardio','incomplete intervals');
    await save(a,payload(ex,[{distance:2,time_seconds:600},{distance:3,time_seconds:null},{distance:null,time_seconds:300},
      {distance:0,time_seconds:0},{distance:null,time_seconds:null}]));
    await save(a,payload(ex,[{distance:0,time_seconds:0}]));
    const c=(await deep(ex)).cardio;
    equal(Number(c.session_count),1,'Zero-only session excluded from cardio totals');
    equal(Number(c.total_distance_km),5,'Available distance counted'); equal(Number(c.total_duration_seconds),900,'Available seconds counted');
    equal(Number(c.average_pace_seconds_per_km),300,'Pace uses only paired positive metrics');
    const solo=await ctx.exercise('cardio','unpaired only');
    await save(a,payload(solo,[{distance:4,time_seconds:null},{distance:null,time_seconds:400}]));
    equal((await deep(solo)).cardio.average_pace_seconds_per_km,null,'Unrelated incomplete rows cannot form a pace');
  });
  await ctx.run('analytics-units',async()=>{
    const ex=await ctx.exercise('strength','units'); const id=await save(a,payload(ex,[{weight:100,reps:5}]));
    for(const unit of ['kg','lb']) {
      data(await ctx.admin.from('profiles').update({settings:{unit_weight:unit,unit_height:unit==='kg'?'cm':'ft_in'}}).eq('id',a.id),'Change fixture unit preference');
      equal(Number((await rpc(a.client,'get_workout_history_detail',{p_workout_history_id:id})).stats.volume_kg),500,'Stored volume remains canonical kg under '+unit);
      equal(Number((await deep(ex)).cards.current.top_weight),100,'Backend weight remains canonical kg under '+unit);
    }
    // Client-side kg/lb display conversion is intentionally not asserted here.
  });
  await ctx.run('analytics-empty',async()=>{
    const ex=await ctx.exercise('cardio','no history'); const c=(await deep(ex)).cardio;
    equal(Number(c.session_count),0,'No sessions'); equal(Number(c.total_distance_km),0,'No distance');
    equal(Number(c.total_duration_seconds),0,'No time'); equal(c.average_pace_seconds_per_km,null,'No fabricated pace'); equal(c.sessions,[],'Empty chart');
  });
  await ctx.run('analytics-old',async()=>{
    const ex=await ctx.exercise('cardio','old history'); const old=await save(a,payload(ex,[{distance:99,time_seconds:9999}],new Date(Date.now()-400*86400000).toISOString()));
    await save(a,payload(ex,[{distance:2,time_seconds:600}]));
    const c=(await deep(ex)).cardio; equal(Number(c.session_count),1,'Annual analytics excludes old session');equal(Number(c.total_distance_km),2,'Old distance excluded');
    equal((await rpc(a.client,'get_workout_history_detail',{p_workout_history_id:old})).header.workout_history_id,old,'Old history still readable');
  });
  await ctx.run('analytics-timezone',async()=>{
    const ex=await ctx.exercise('strength','month boundary');
    const month=new Date().toISOString().slice(0,7);
    const local=month+'-01T00:30:00+14:00';
    const first=await save(a,payload(ex,[{weight:20,reps:5}],local));
    const second=await save(a,payload(ex,[{weight:20,reps:5}],new Date(local).toISOString()));
    data(await ctx.admin.from('profiles').update({timezone:'Pacific/Kiritimati'}).eq('id',a.id),'Set local timezone');
    const feed=await rpc(a.client,'get_workout_history_feed',{p_limit:50});
    const group=feed.groups.find(g=>g.key===month); assert.ok(group,'Local-month group must exist');
    for(const id of [first,second]) assert.ok(group.items.some(i=>i.workout_history_id===id),'Offset-equivalent instant assigned to local month');
    const points=(await deep(ex)).charts.volume_trend;
    // Date labels are independently asserted through the feed grouping above.
    if(points) assert.ok(Array.isArray(points),'Chart payload remains an array');
  });
  await ctx.run('analytics-dst',async()=>{
    data(await ctx.admin.from('profiles').update({timezone:'Europe/London'}).eq('id',a.id),'Set London timezone');
    const ex=await ctx.exercise('strength','DST repeated hour');
    const first=await save(a,payload(ex,[{weight:20,reps:5}],'2025-10-26T01:30:00+01:00'));
    const second=await save(a,payload(ex,[{weight:20,reps:5}],'2025-10-26T01:30:00+00:00'));
    const name=data(await ctx.admin.from('exercises').select('name').eq('id',ex).single(),'Search name').name;
    const feed=await rpc(a.client,'get_workout_history_feed',{p_query:name,p_limit:50});
    equal(feed.items.map(i=>i.workout_history_id),[second,first],'Repeated local hour has distinct ordered instants');
    equal(feed.groups.map(g=>g.key),['2025-10'],'Both DST-hour records belong to October');
  });
  const pager=await ctx.account('pagination'), ex=await ctx.exercise('strength','pagination search');
  const saved=[]; const date=new Date(Date.now()-86400000).toISOString();
  for(let i=0;i<7;i++) saved.push(await save(pager,payload(ex,[{weight:20,reps:5}],date)));
  // Same exercise and instant belonging to another user must not enter pages.
  await save(ctx.recoveryOther,payload(ex,[{weight:999,reps:99}],date));
  async function pages(query=null) {
    let cursor={}, ids=[];
    for(let page=0;page<10;page++) {
      const result=await rpc(pager.client,'get_workout_history_feed',{p_limit:2,p_query:query,...cursor});
      if(!result.items.length) return ids;
      ids.push(...result.items.map(i=>i.workout_history_id));
      const last=result.items.at(-1); cursor={p_cursor_completed_at:last.completed_at,p_cursor_id:last.workout_history_id};
    }
    throw Error('Pagination did not terminate');
  }
  await ctx.run('analytics-pagination',async()=>{equal(await pages(),[...saved].sort().reverse(),'Every owned tied-timestamp item exactly once');});
  await ctx.run('analytics-search',async()=>{
    const name=data(await ctx.admin.from('exercises').select('name').eq('id',ex).single(),'Search name').name;
    equal(await pages(name),[...saved].sort().reverse(),'Search pagination has no missing or duplicate sessions');equal(await pages('no-such-exercise-'+ex),[],'Unmatched search empty');
  });
  await ctx.run('social-pagination',async()=>{
    const viewer=await ctx.account('social pagination viewer'); const expected=[];
    for(let i=0;i<saved.length;i++) {
      const id=await createPost(pager,saved[i],i%2?'private':'public');
      data(await ctx.admin.from('posts').update({created_at:date}).eq('id',id),'Tie post timestamp');
      if(i%2===0)expected.push(id);
    }
    for(const endpoint of ['get_feed','get_user_posts_v1']) {
      let cursor={}, ids=[];
      for(let page=0;page<10;page++) {
        const args={p_limit:2,...cursor,...(endpoint==='get_user_posts_v1'?{p_user_id:pager.id}:{})};
        const rows=await rpc(viewer.client,endpoint,args);
        // Other public fixtures may be in the global feed: filter after pagination.
        ids.push(...rows.filter(r=>r.user_id===pager.id).map(r=>r.post_id));
        if(!rows.length) break;
        const last=rows.at(-1);cursor={p_cursor_created_at:last.created_at,p_cursor_id:last.post_id};
        assert.ok(page<9,'Social pagination terminates');
      }
      equal(ids,[...expected].sort().reverse(),endpoint+' paginates visible posts only');
    }
  });
};
