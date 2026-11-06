'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {sourceConstant}=require('../../verify-production-workout-rpc.cjs');
const {workoutPayload}=require('../tester-workout-flow.cjs');
const {data}=require('../backend/helpers.cjs');
const FILE='ci-artifacts/native/fixtures.json';
const USER='d36d46e6-b8db-4675-843f-262e7141db00';
const TABLES=['workout_history','posts','plans','goals','live_workout_drafts'];
function config(){
 const source=fs.readFileSync('lib/supabase.ts','utf8');
 const url=sourceConstant(source,'SUPABASE_URL'),anonKey=sourceConstant(source,'SUPABASE_ANON_KEY');
 assert.equal(url,'https://cpzgnhchdpkxnebjsyyi.supabase.co');return {url,anonKey};
}
async function connect(){
 const {url,anonKey}=config();
 const email=process.env.E2E_TESTER_EMAIL,password=process.env.E2E_TESTER_PASSWORD;
 assert.ok(email&&password,'Existing GitHub E2E tester secrets are required');
 const client=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const session=data(await client.auth.signInWithPassword({email,password}),'Authenticate fixed tester');
 assert.equal(session.user.id,USER,'Refuse any other account');
 const profile=data(await client.from('profiles').select('username,active_plan_id,weekly_workout_goal,settings').eq('id',USER).single(),'Read tester');
 assert.equal(profile.username,'tester');return {client,profile};
}
async function baseline(client){
 const counts={};
 for(const table of TABLES){const r=await client.from(table).select('*',{count:'exact',head:true}).eq('user_id',USER);data(r,'Count '+table);counts[table]=r.count;}
 const templates=data(await client.from('workouts').select('id').eq('user_id',USER),'Read existing templates').map(r=>r.id).sort();
 return {counts,templates};
}
function validate(m){
 assert.equal(m.version,1);assert.equal(m.userId,USER);assert.match(m.runId,/^[a-f0-9-]{36}$/);
 assert.equal(m.marker,'Maestro '+m.runId);
 for(const key of ['workout','recovery','plans']) {assert.match(m.templates[key].id,/^[a-f0-9-]{36}$/);assert.equal(m.templates[key].title,m.marker+' '+key);}
 assert.equal(m.planTitle,m.marker+' plan');assert.equal(m.editedTitle,m.marker+' edited');assert.equal(m.caption,m.marker+' private post');
 assert.equal(m.profile.active_plan_id,null);
 for(const table of TABLES)assert.equal(m.baseline.counts[table],0);
 assert.equal(m.saves.length,2);
 for(const id of m.saves)assert.match(id,/^[a-f0-9-]{36}$/);
 assert.match(m.weekKey,/^\d{4}-\d{2}-\d{2}$/);
 assert.ok(m.weekly.length<=1);
 for(const row of m.weekly){assert.equal(row.user_id,USER);assert.equal(row.week_key,m.weekKey);}
 for(const t of Object.values(m.templates))assert.ok(!m.baseline.templates.includes(t.id));
 return m;
}
function load(){return validate(JSON.parse(fs.readFileSync(FILE)));}
async function prepare(){
 const {client,profile}=await connect();const b=await baseline(client);
 for(const [table,n] of Object.entries(b.counts))assert.equal(n,0,'Tester must start empty: '+table);
 assert.equal(profile.active_plan_id,null,'Tester has an existing active plan');
 const exercises={};for(const type of ['strength','cardio']) {
  exercises[type]=data(await client.from('exercises').select('id,name').eq('is_public',true).eq('type',type).order('id').limit(1),'Find existing '+type)[0];
  assert.ok(exercises[type]?.id,'Missing public '+type+' exercise');
 }
 const runId=randomUUID(),marker='Maestro '+runId;
 const date=new Date();date.setUTCHours(0,0,0,0);date.setUTCDate(date.getUTCDate()-date.getUTCDay());const weekKey=date.toISOString().slice(0,10);
 const weekly=data(await client.from('user_weekly_workout_stats').select('*').eq('user_id',USER).eq('week_key',weekKey),'Snapshot weekly stats');
 const m={version:1,userId:USER,runId,marker,profile,baseline:b,exercises,weekKey,weekly,
  templates:Object.fromEntries(['workout','recovery','plans'].map(k=>[k,{id:randomUUID(),title:marker+' '+k}])),
  saves:[randomUUID(),randomUUID()],planTitle:marker+' plan',editedTitle:marker+' edited',caption:marker+' private post'};
 fs.mkdirSync('ci-artifacts/native',{recursive:true});fs.writeFileSync(FILE,JSON.stringify(m,null,2),{mode:0o600});
}
async function seed(){
 const m=load(),{client}=await connect();assert.deepEqual(await baseline(client),m.baseline,'Tester changed since preflight');
 for(const t of Object.values(m.templates)){
  data(await client.from('workouts').insert({id:t.id,user_id:USER,title:t.title,notes:m.marker}),'Create run template');
  data(await client.from('workout_exercises').insert({workout_id:t.id,exercise_id:m.exercises.strength.id,order_index:0,target_sets:1,target_reps:10}),'Create one planned set');
 }
 for(const [i,distance] of [2,3].entries()) {
  const p=workoutPayload({clientSaveId:m.saves[i],label:m.runId,exercises:[{id:m.exercises.cardio.id,sets:[{distance,time_seconds:distance*300}]}]});
  data(await client.rpc('save_completed_workout_v2',{p_workout:p,p_expected_user_id:USER}),'Seed known cardio history');
 }
}
module.exports={validate,config,connect,baseline,load,prepare,seed,FILE,USER};
if(require.main===module)(process.argv[2]==='prepare'?prepare():seed()).catch(e=>{console.error(e.message);process.exitCode=1;});
