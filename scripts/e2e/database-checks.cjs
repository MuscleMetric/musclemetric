#!/usr/bin/env node
"use strict";
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const report = require('./production-report.cjs');

function parseTap(output) {
  const lines=output.split(/\r?\n/), tests=[];
  let plan=null, bailout=false;
  for(let i=0;i<lines.length;i++) {
    const line=lines[i].trim();
    if(/^Bail out!/i.test(line)) bailout=true;
    const p=line.match(/^1\.\.(\d+)/); if(p) plan=Number(p[1]);
    const match=line.match(/^(not ok|ok)\s+(\d+)(?:\s*-?\s*)(.*)$/);
    if(!match)continue;
    let diagnostic='';
    for(let j=i+1;j<lines.length && /^\s*#/.test(lines[j]);j++) diagnostic+=lines[j]+'\n';
    tests.push({number:Number(match[2]), name:match[3]||'Assertion '+match[2],
      status:/#\s*(SKIP|TODO)\b/i.test(match[3])?'skipped':match[1]==='ok'?'passed':'failed',message:diagnostic});
  }
  const valid=plan!==null && plan===tests.length && new Set(tests.map(t=>t.number)).size===plan &&
    tests.every(t=>t.number>=1&&t.number<=plan) && !bailout;
  return {tests,plan,valid};
}
function runSql() {
  // Docker-local only; never accepts a remote DB URL or Supabase linked project.
  const project=fs.readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([\w-]+)"/m)?.[1];
  assert.ok(project,'Missing local project ID');
  let failed=false;
  for(const file of fs.readdirSync('supabase/tests/database').filter(f=>f.endsWith('.sql')).sort()) {
    const start=Date.now();
    const sql=fs.readFileSync(path.join('supabase/tests/database',file),'utf8');
    const result=spawnSync('docker',['exec','-i','supabase_db_'+project,'psql','-X','-A','-t','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
      {input:'set search_path = public, extensions;\n'+sql,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
    const output=(result.stdout||'')+'\n'+(result.stderr||'');const parsed=parseTap(output);
    const ok=result.status===0 && parsed.valid && parsed.tests.every(t=>t.status!=='failed');
    for(const t of parsed.tests) report.record('pgtap/'+file+'/'+t.number,{suite:'Database rules / '+file,name:t.name,status:t.status,message:t.message,start,stop:Date.now()});
    report.record('sql-file/'+file,{suite:'Database file execution',name:file,status:ok?'passed':'broken',
      message:ok?undefined:'SQL execution, TAP assertion or test-plan validation failed',log:output,start,stop:Date.now()});
    console.log((ok?'PASS ':'FAIL ')+file+': '+parsed.tests.length+' assertions');
    if(!ok){failed=true;console.error(report.sanitize(output));}
  }
  if(failed)process.exitCode=1;
}
const commands = {
  legacy: ['Existing authenticated backend E2E','scripts/e2e/tester-workout-flow.cjs'],
  'production-contract': ['Live production contracts','scripts/verify-production-workout-rpc.cjs'],
  'profile-contract': ['Live production contracts','scripts/verify-production-profile-settings-rpc.cjs'],
  'live-smoke': ['Live production smoke','scripts/e2e/live-tester-workout-flow.cjs'],
};
function runCommand(id) {
  assert.ok(commands[id],'Unknown check command');
  const [suite,file]=commands[id],start=Date.now();
  const result=spawnSync(process.execPath,[file],{encoding:'utf8',timeout:300000,maxBuffer:8*1024*1024});
  const output=(result.stdout||'')+'\n'+(result.stderr||'');
  for(const line of output.split('\n').filter(l=>l.startsWith('PASS '))) {
    const key=crypto.createHash('sha256').update(line).digest('hex');
    report.record(id+'/'+key,{suite,parentSuite:id==='legacy'?'Disposable database checks':'Live production checks',name:line.slice(5),status:'passed',start,stop:Date.now()});
  }
  report.record('command/'+id,{suite,parentSuite:id==='legacy'?'Disposable database checks':'Live production checks',name:path.basename(file)+' — complete execution',status:result.status===0?'passed':'broken',
    message:result.status===0?undefined:'Check failed or timed out; inspect attached output',log:output,start,stop:Date.now()});
  console.log(report.sanitize(output));
  if(result.status!==0)process.exitCode=1;
}
if(require.main===module) {
  try { if(process.argv[2]==='sql')runSql();else runCommand(process.argv[2]); }
  catch(error){console.error(report.sanitize(error.message));process.exitCode=1;}
}
module.exports={parseTap,runSql};
