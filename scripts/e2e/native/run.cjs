'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {makeContext,data,equal}=require('../backend/helpers.cjs');
const {cases,write}=require('./report.cjs');
const base=require('../production-report.cjs');
const ctx=makeContext(); // local-only guard before database or emulator operations
const fixtures=JSON.parse(fs.readFileSync('ci-artifacts/native/fixtures.json'));
const secrets=Object.values(fixtures.accounts).flatMap(a=>[a.email,a.password]);
function scrub(s){for(const secret of secrets)s=s.split(secret).join('[REDACTED]');return base.sanitize(s);}
function command(cmd,args,timeout=300000){const r=spawnSync(cmd,args,{encoding:'utf8',timeout,maxBuffer:16*1024*1024});if(r.status!==0)throw Error(scrub((r.stdout||'')+'\n'+(r.stderr||'')+'\n'+(r.error?.message||cmd+' exited '+r.status)));return r.stdout;}
function screenshots(dir,out=[]) {if(!fs.existsSync(dir))return out;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())screenshots(p,out);else if(p.endsWith('.png'))out.push(p);}return out;}
let phase=0;
function flow(file,account,extra={}) {
  const dir='ci-artifacts/native/phase-'+(++phase);fs.mkdirSync(dir,{recursive:true});
  const env={EMAIL:account.email,PASSWORD:account.password,TEMPLATE_ID:account.template,CARDIO_ID:fixtures.cardio,OWNER_ID:fixtures.accounts.social.id,...extra};
  const args=['test','--format','junit','--output',dir+'/report.xml','--test-output-dir',dir];
  for(const [k,v] of Object.entries(env))args.push('-e',k+'='+v);
  args.push('.maestro/'+file+'.yaml');
  command('maestro',args);
  command('python3',['scripts/e2e/native/junit.py',dir+'/report.xml']);
}
async function verifyWorkout(account) {
  const rows=data(await ctx.admin.from('workout_history').select('id').eq('user_id',account.id),'Read saved workout');
  equal(rows.length,1,'One completed workout, no duplicates');
  const client=await ctx.reconnect(account);
  const detail=data(await client.rpc('get_workout_history_detail',{p_workout_history_id:rows[0].id}),'Read saved detail');
  equal(Number(detail.stats.volume_kg),500,'UI values persisted exactly');equal(Number(detail.stats.sets_count),1,'One completed set persisted');
}
async function main(){
 let failed=false;
 for(const id of Object.keys(cases)) {
  const a=fixtures.accounts[id];const startPhase=phase,start=Date.now();let error;
  try {
   flow(id,a);
   if(id==='workout')await verifyWorkout(a);
   if(id==='plans') {
    const plan=data(await ctx.admin.from('plans').select('id').eq('user_id',a.id).eq('title','Maestro Plan').single(),'Find UI-created plan');
    flow('helpers/edit-plan',a,{PLAN_ID:plan.id});
    equal(data(await ctx.admin.from('plans').select('title').eq('id',plan.id).single(),'Read edited plan').title,'Maestro Plan Edited','UI edit persisted');
   }
   if(id==='recovery') {
    // Toggle only the simulator's loopback proxy, never the hosted database.
    const marker='ci-artifacts/native/offline';
    try {fs.writeFileSync(marker,'offline');flow('helpers/recover-offline',a);}
    finally {fs.rmSync(marker,{force:true});}
    for(let i=0;i<30;i++){try{const r=await fetch(process.env.API_URL+'/auth/v1/health',{headers:{apikey:process.env.ANON_KEY}});if(r.ok)break;}catch { /* Wait for the disposable API to restart. */ } await new Promise(r=>setTimeout(r,1000));}
    flow('helpers/save',a);await verifyWorkout(a);
   }
   if(id==='social')flow('helpers/social-stranger',fixtures.accounts.stranger);
  }catch(e){failed=true;error=e;console.error(id+': '+scrub(e.message));}
  const attachments=[];fs.mkdirSync(process.env.MM_ALLURE_RESULTS,{recursive:true});
  for(let n=startPhase+1;n<=phase;n++) for(const p of screenshots('ci-artifacts/native/phase-'+n)) {
   const source=id+'-'+attachments.length+'.png';fs.copyFileSync(p,path.join(process.env.MM_ALLURE_RESULTS,source));attachments.push({name:'Native screen '+attachments.length,source,type:'image/png'});
  }
  write(id,error?'failed':'passed',error?scrub(error.message):undefined,error?scrub(error.stack):undefined,attachments,start);
 }
 if(failed)process.exitCode=1;
}
main().catch(e=>{write('Suite execution','broken',scrub(e.message));process.exitCode=1;});
