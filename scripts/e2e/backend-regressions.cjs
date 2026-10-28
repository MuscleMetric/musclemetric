#!/usr/bin/env node
"use strict";
process.env.MM_REPORT_SUITE = 'backend';
const report = require('./production-report.cjs');
const { makeContext, data } = require('./backend/helpers.cjs');
async function main() {
  const ctx=makeContext();
  try {
    await report.run('backend-setup',async()=>{
      for(const key of ['owner','follower','stranger','recoveryOwner','recoveryOther','analyticsOwner']) ctx[key]=await ctx.account(key);
      ctx.strength=await ctx.exercise('strength','strength'); ctx.cardio=await ctx.exercise('cardio','cardio');
    });
    for(const name of ['privacy','recovery','analytics']) {
      try { await require('./backend/'+name+'.cjs')(ctx); }
      catch(error) { ctx.failures.push(name+' fixture/setup');console.error(report.sanitize(error.stack));
        // Persist fixture failures, even if they occurred between planned cases.
        await ctx.run(name+'-fixture-failure',async()=>{throw error;}); }
    }
  } finally {
    await ctx.run('backend-cleanup',async()=>{
      const failures=[];
      for(const account of ctx.accounts) {
        try { data(await ctx.admin.auth.admin.deleteUser(account.id),'Delete disposable auth account'); }
        catch(error){failures.push(error.message);}
      }
      if(ctx.exercises.length) {
        try { data(await ctx.admin.from('exercises').delete().in('id',ctx.exercises),'Delete seeded exercises'); }
        catch(error){failures.push(error.message);}
      }
      if(failures.length) throw Error(failures.join('; '));
    });
    report.finalize();
  }
  if(ctx.failures.length) throw Error(ctx.failures.length+' backend cases failed: '+ctx.failures.join(', '));
}
if(require.main===module) main().catch(error=>{ console.error(report.sanitize(error.message)); process.exitCode=1; });
module.exports={main};
