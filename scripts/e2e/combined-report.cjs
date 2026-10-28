"use strict";
const fs=require('node:fs');
const report=require('./production-report.cjs');
for(const [name,env] of [['Disposable database suite','DATABASE_RESULT'],['Live production suite','PRODUCTION_RESULT']]) {
  const outcome=process.env[env]||'unknown';
  report.record('job/'+env,{suite:'Workflow completion',name,status:outcome==='success'?'passed':outcome==='skipped'?'skipped':'broken',
    message:'GitHub job conclusion: '+outcome});
}
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  '\n## Complete database report\n\nThe report separates disposable database tests from live production checks.\n\n'+
  '| Suite | GitHub result |\n| --- | --- |\n| Disposable database | '+process.env.DATABASE_RESULT+' |\n| Live production | '+process.env.PRODUCTION_RESULT+' |\n\n'+
  'Skipped or broken suites are not coverage passes. Expand Database rules for individual SQL assertions, then backend Privacy, Save recovery, Analytics and Cleanup.\n');
