'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {connect,baseline,load,FILE,USER}=require('./fixtures.cjs');
const {data}=require('../backend/helpers.cjs');
const {write}=require('./report.cjs');
async function cleanup(){
 if(!fs.existsSync(FILE)){write('Fixture cleanup','skipped','No manifest; no fixtures were created');return;}
 fs.rmSync('ci-artifacts/native/offline',{force:true});
 const m=load(),{client}=await connect(),errors=[];
 const attempt=async(name,fn)=>{try{await fn();}catch(e){errors.push(name+': '+e.message);}};
 async function remove(table,fields){let q=client.from(table).delete().eq('user_id',USER);for(const [k,v] of Object.entries(fields))q=q.eq(k,v);data(await q,'Remove run '+table);}
 const plans=data(await client.from('plans').select('id,title').eq('user_id',USER).in('title',[m.planTitle,m.editedTitle]),'Find run plans');
 await attempt('private post',()=>remove('posts',{caption:m.caption,visibility:'private'}));
 await attempt('draft',async()=>{
  const rows=data(await client.from('live_workout_drafts').select('workout_id,updated_at').eq('user_id',USER),'Read draft');
  for(const r of rows){assert.ok(Object.values(m.templates).some(t=>t.id===r.workout_id),'Unrelated draft; refuse deletion');await remove('live_workout_drafts',r);}
 });
 await attempt('histories',async()=>{
  for(const id of m.saves)await remove('workout_history',{client_save_id:id,notes:'AUTOMATED_E2E_FIXTURE '+m.runId});
  for(const t of Object.values(m.templates))await remove('workout_history',{workout_id:t.id});
 });
 await attempt('profile',async()=>{
  const {profile:p}=await connect();
  assert.ok(p.active_plan_id===null||plans.some(r=>r.id===p.active_plan_id),'Unrelated active plan');
  assert.ok(p.weekly_workout_goal===m.profile.weekly_workout_goal||p.weekly_workout_goal===1,'Unexpected weekly goal');
  const expected={...(m.profile.settings||{}),workout_week_key:m.weekKey};
  assert.ok(JSON.stringify(p.settings)===JSON.stringify(m.profile.settings)||require('node:util').isDeepStrictEqual(p.settings,expected),'Unrelated profile settings changes');
  let q=client.from('profiles').update({active_plan_id:null,weekly_workout_goal:m.profile.weekly_workout_goal,settings:m.profile.settings}).eq('id',USER);
  q=p.active_plan_id?q.eq('active_plan_id',p.active_plan_id):q.is('active_plan_id',null);
  data(await q,'Restore tester preferences');
 });
 await attempt('weekly stats',async()=>{
  const rows=data(await client.from('user_weekly_workout_stats').select('*').eq('user_id',USER).eq('week_key',m.weekKey),'Read weekly stats');
  if(JSON.stringify(rows)===JSON.stringify(m.weekly))return;
  assert.equal(rows.length,1);const row=rows[0];assert.equal(row.goal,1);assert.equal(row.completed,0);assert.equal(row.met,false);
  // Compare-and-swap prevents overwriting a concurrent manual update.
  if(m.weekly.length)data(await client.from('user_weekly_workout_stats').update(m.weekly[0]).eq('user_id',USER).eq('week_key',m.weekKey).eq('updated_at',row.updated_at),'Restore weekly stats');
  else await remove('user_weekly_workout_stats',{week_key:m.weekKey,updated_at:row.updated_at});
 });
 await attempt('plans',async()=>{for(const p of plans)await remove('plans',p);});
 await attempt('templates',async()=>{
  for(const t of Object.values(m.templates)) {
   await remove('workouts',{id:t.id,title:t.title,notes:m.marker});
   await remove('workouts',{title:t.title,notes:m.marker,created_source:'plan_clone'});
  }
 });
 await attempt('baseline',async()=>{
  assert.deepEqual(await baseline(client),m.baseline,'Tester did not return to original record counts/templates');
  const {profile}=await connect();assert.deepEqual(profile,m.profile,'Tester profile changed');
  assert.deepEqual(data(await client.from('user_weekly_workout_stats').select('*').eq('user_id',USER).eq('week_key',m.weekKey),'Verify weekly stats'),m.weekly);
 });
 if(errors.length)throw Error(errors.join('; '));
 write('Fixture cleanup','passed','Only run-owned data removed; original templates, profile and weekly stats restored');
 fs.rmSync(FILE);
}
module.exports={cleanup};
if(require.main===module)cleanup().catch(e=>{write('Fixture cleanup','broken',e.message);process.exitCode=1;});
