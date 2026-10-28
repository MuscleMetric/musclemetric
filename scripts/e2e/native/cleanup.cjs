'use strict';
const fs=require('node:fs');
const {makeContext,data}=require('../backend/helpers.cjs');
const {write}=require('./report.cjs');
async function cleanup(){
 const file='ci-artifacts/native/fixtures.json';
 if(!fs.existsSync(file)){write('Fixture cleanup','skipped','No fixture manifest was created');return;}
 fs.rmSync('ci-artifacts/native/offline',{force:true});
 const ctx=makeContext(),manifest=JSON.parse(fs.readFileSync(file));const errors=[];
 for(const id of manifest.cleanupAccounts||[]) {
  try{data(await ctx.admin.auth.admin.deleteUser(id),'Remove this run’s disposable account');}catch(e){errors.push(e.message);}
 }
 if(manifest.cleanupExercises?.length)try{data(await ctx.admin.from('exercises').delete().in('id',manifest.cleanupExercises),'Remove this run’s exercises');}catch(e){errors.push(e.message);}
 if(errors.length)throw Error(errors.join('; '));
 write('Fixture cleanup','passed','This run’s accounts and exercises removed');fs.rmSync(file);
}
cleanup().catch(e=>{write('Fixture cleanup','broken',e.message);process.exitCode=1;});
