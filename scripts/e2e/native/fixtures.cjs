'use strict';
const {makeContext,data,payload,save,rpc} = require('../backend/helpers.cjs');
const fs=require('node:fs');
async function seed() {
  const ctx=makeContext();
  let manifest={accounts:{}};
  try {
  const strength=await ctx.exercise('strength','Maestro Press');
  const cardio=await ctx.exercise('cardio','Maestro Run');
  // Rename to stable, distinct visible strings used by the native flows.
  data(await ctx.admin.from('exercises').update({name:'Maestro Press',equipment:'Barbell'}).eq('id',strength),'Name strength');
  data(await ctx.admin.from('exercises').update({name:'Maestro Run'}).eq('id',cardio),'Name cardio');
  manifest={accounts:{},strength,cardio};
  for(const key of ['auth','workout','progress','plans','recovery','social','stranger']) {
    const a=await ctx.account('Maestro '+key);
    data(await ctx.admin.from('profiles').update({height:180,weight:80,date_of_birth:'2000-01-01',weekly_workout_goal:3,steps_goal:8000,
      onboarding_stage2_completed_at:new Date().toISOString(),onboarding_stage3_completed_at:new Date().toISOString(),
      onboarding_step:3,onboarding_completed_at:new Date().toISOString(),
      settings:{level:'beginner',primaryGoal:'strength',unit_height:'cm',unit_weight:'kg'}}).eq('id',a.id),'Complete fixture onboarding');
    const template=data(await ctx.admin.from('workouts').insert({user_id:a.id,title:'Maestro Workout'}).select('id').single(),'Seed template').id;
    data(await ctx.admin.from('workout_exercises').insert({workout_id:template,exercise_id:strength,order_index:0,target_sets:1,target_reps:10}),'Seed template exercise');
    manifest.accounts[key]={id:a.id,email:a.email,password:a.password,template};
    if(key==='progress') for(const distance of [2,3]) await save(a,payload(cardio,[{distance,time_seconds:distance*300}]));
    if(key==='social') {
      const history=await save(a,payload(strength,[{weight:50,reps:10}]));
      for(const visibility of ['public','private']) await rpc(a.client,'create_post_v2',{p_caption:'Maestro '+visibility+' post',p_exercise_id:null,p_post_type:'workout',p_pr_reps:null,p_pr_weight:null,p_visibility:visibility,p_workout_history_id:history});
    }
  }
  } finally {
  manifest.cleanupAccounts=ctx.accounts.map(a=>a.id);
  manifest.cleanupExercises=ctx.exercises;
  fs.mkdirSync('ci-artifacts/native',{recursive:true});
  fs.writeFileSync('ci-artifacts/native/fixtures.json',JSON.stringify(manifest),{mode:0o600});
  }
}
if(require.main===module)seed().catch(e=>{console.error(e.message);process.exitCode=1;});
