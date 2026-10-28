'use strict';
const fs=require('node:fs');
const path=require('node:path');
const report=require('../production-report.cjs');
const cases={auth:'Authentication: session restore, rejected credentials and logout',workout:'Workout: enter sets, save and verify history',progress:'Progress: known cardio totals on screen',plans:'Plans: create, edit and reopen',recovery:'Recovery: relaunch offline and save after reconnection',social:'Social privacy: owner and stranger views'};
function write(id,status,message,log,attachments=[],start=Date.now()) {
  const row=report.record('native/'+id,{parentSuite:'Native frontend — iOS',suite:cases[id]?'First user journeys':'Workflow',name:cases[id]||id,status,message,log,start,stop:Date.now()});
  if(attachments.length) {
    row.attachments=[...(row.attachments||[]),...attachments];
    fs.writeFileSync(path.join(process.env.MM_ALLURE_RESULTS,row.uuid+'-result.json'),JSON.stringify(row));
  }
}
function finalize() {
  const dir=process.env.MM_ALLURE_RESULTS;
  fs.mkdirSync(dir,{recursive:true});
  const rows=fs.readdirSync(dir).filter(f=>f.endsWith('-result.json')).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f))));
  const missing=Object.keys(cases).filter(id=>!rows.some(r=>r.testCaseId==='native/'+id));
  for(const id of missing)write(id,'skipped','Not executed: native build, emulator or fixture setup did not complete.');
  if(missing.length)write('Suite execution','broken','Native suite incomplete: '+missing.join(', '));
}
module.exports={cases,write,finalize};
if(require.main===module)finalize();
