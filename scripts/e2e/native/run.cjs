'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {data,equal}=require('../backend/helpers.cjs');
const {write}=require('./report.cjs');
const base=require('../production-report.cjs');
const {connect,load,USER}=require('./fixtures.cjs');
const fixtures=load();
const secrets=[process.env.E2E_TESTER_EMAIL,process.env.E2E_TESTER_PASSWORD].filter(Boolean);
function scrub(s){for(const secret of secrets)s=s.split(secret).join('[REDACTED]');return base.sanitize(s);}
function command(cmd,args,timeout=300000){const r=spawnSync(cmd,args,{encoding:'utf8',timeout,maxBuffer:16*1024*1024});if(r.status!==0)throw Error(scrub((r.stdout||'')+'\n'+(r.stderr||'')+'\n'+(r.error?.message||cmd+' exited '+r.status)));return r.stdout;}
function screenshots(dir,out=[]) {if(!fs.existsSync(dir))return out;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())screenshots(p,out);else if(p.endsWith('.png'))out.push(p);}return out;}
let phase=0;
function flow(file,account,extra={}) {
  const dir='ci-artifacts/native/phase-'+(++phase);fs.mkdirSync(dir,{recursive:true});
  const env={EMAIL:account.email,PASSWORD:account.password,TEMPLATE_ID:account.template,CARDIO_ID:fixtures.exercises.cardio.id,OWNER_ID:USER,STRENGTH_NAME:fixtures.exercises.strength.name,CARDIO_NAME:fixtures.exercises.cardio.name,TEMPLATE_TITLE:account.title,PLAN_TITLE:fixtures.planTitle,EDITED_TITLE:fixtures.editedTitle,PRIVATE_CAPTION:fixtures.caption,...extra};
  const args=['test','--format','junit','--output',dir+'/report.xml','--test-output-dir',dir];
  for(const [k,v] of Object.entries(env))args.push('-e',k+'='+v);
  args.push('.maestro/'+file+'.yaml');
  command('maestro',args);
  command('python3',['scripts/e2e/native/junit.py',dir+'/report.xml']);
}
async function verifyWorkout(account,client) {
  const rows=data(await client.from('workout_history').select('id').eq('user_id',USER).eq('workout_id',account.template),'Read saved workout');
  equal(rows.length,1,'One completed workout, no duplicates');
  const detail=data(await client.rpc('get_workout_history_detail',{p_workout_history_id:rows[0].id}),'Read saved detail');
  equal(Number(detail.stats.volume_kg),500,'UI values persisted exactly');equal(Number(detail.stats.sets_count),1,'One completed set persisted');
}
async function main(){
 const {client}=await connect();
 let failed=false;
 for(const id of ['auth','workout','progress','recovery','plans','social']) {
  if(id==='plans' && fixtures.weekly.length===0){write(id,'skipped','Blocked: plan creation inserts weekly stats, but production RLS has no owner DELETE policy. No existing weekly row can be restored.');continue;}
  const t=fixtures.templates[id]||fixtures.templates.workout;
  const a={id:USER,email:process.env.E2E_TESTER_EMAIL,password:process.env.E2E_TESTER_PASSWORD,template:t.id,title:t.title};const startPhase=phase,start=Date.now();let error;
  try {
   if(id==='social') {
    const history=data(await client.from('workout_history').select('id').eq('user_id',USER).eq('client_save_id',fixtures.saves[0]).single(),'Find private post history');
    data(await client.rpc('create_post_v2',{p_caption:fixtures.caption,p_exercise_id:null,p_post_type:'workout',p_pr_reps:null,p_pr_weight:null,p_visibility:'private',p_workout_history_id:history.id}),'Create private test post');
   }
   flow(id,a);
   if(id==='workout')await verifyWorkout(a,client);
   if(id==='plans') {
    const plan=data(await client.from('plans').select('id').eq('user_id',a.id).eq('title',fixtures.planTitle).single(),'Find UI-created plan');
    flow('helpers/edit-plan',a,{PLAN_ID:plan.id});
    equal(data(await client.from('plans').select('title').eq('id',plan.id).single(),'Read edited plan').title,fixtures.editedTitle,'UI edit persisted');
   }
   if(id==='recovery') {
    // Toggle only the simulator's loopback proxy, never the hosted database.
    const marker='ci-artifacts/native/offline';
    try {fs.writeFileSync(marker,'offline');flow('helpers/recover-offline',a);}
    finally {fs.rmSync(marker,{force:true});}
    flow('helpers/save',a);await verifyWorkout(a,client);
   }

  }catch(e){failed=true;error=e;console.error(id+': '+scrub(e.message));}
  const attachments=[];fs.mkdirSync(process.env.MM_ALLURE_RESULTS,{recursive:true});
  for(let n=startPhase+1;n<=phase;n++) for(const p of screenshots('ci-artifacts/native/phase-'+n)) {
   const source=id+'-'+attachments.length+'.png';fs.copyFileSync(p,path.join(process.env.MM_ALLURE_RESULTS,source));attachments.push({name:'Native screen '+attachments.length,source,type:'image/png'});
  }
  write(id,error?'failed':'passed',error?scrub(error.message):undefined,error?scrub(error.stack):undefined,attachments,start);
 }
 write('Signed-in stranger privacy','skipped','Not executed: only one tester login is configured. Owner visibility does not prove cross-account privacy.');
 if(failed)process.exitCode=1;
}
main().catch(e=>{write('Suite execution','broken',scrub(e.message));process.exitCode=1;});
