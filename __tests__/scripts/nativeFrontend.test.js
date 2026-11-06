/* global it, expect */
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
it.each([
 ['<testsuite><testcase name="ui"/></testsuite>',0],
 ['<testsuite><testcase><failure message="wrong total"/></testcase></testsuite>',1],
 ['<testsuite><testcase><skipped/></testcase></testsuite>',1],
 ['<testsuite/>',1],['not XML',1],
])('native JUnit parser preserves failures and never passes empty results', (xml,code)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-report-'));
 try{const file=path.join(dir,'report.xml');fs.writeFileSync(file,xml);expect(spawnSync('python3',['scripts/e2e/native/junit.py',file]).status).toBe(code);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
it('native app configuration refuses production and separates the test package',()=>{
 const config=require('../../app.config.js');
 const oldFlag=process.env.EXPO_PUBLIC_NATIVE_E2E,oldUrl=process.env.EXPO_PUBLIC_SUPABASE_URL;
 try {
  delete process.env.EXPO_PUBLIC_NATIVE_E2E;
  expect(config().ios.bundleIdentifier).toBe('com.musclemetric.app');
  process.env.EXPO_PUBLIC_NATIVE_E2E='true';
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  expect(()=>config()).toThrow('local Supabase');
  process.env.EXPO_PUBLIC_SUPABASE_URL='https://production.supabase.co';
  expect(()=>config()).toThrow('local Supabase');
  process.env.EXPO_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321';
  expect(config().ios.bundleIdentifier).toBe('com.musclemetric.app.e2e');
 }finally{
  if(oldFlag===undefined)delete process.env.EXPO_PUBLIC_NATIVE_E2E;else process.env.EXPO_PUBLIC_NATIVE_E2E=oldFlag;
  if(oldUrl===undefined)delete process.env.EXPO_PUBLIC_SUPABASE_URL;else process.env.EXPO_PUBLIC_SUPABASE_URL=oldUrl;
 }
});
it('missing native executions become skipped plus a broken suite, never green',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-missing-'));
 try {
  const r=spawnSync(process.execPath,['scripts/e2e/native/report.cjs'],{env:{...process.env,MM_ALLURE_RESULTS:dir}});
  expect(r.status).toBe(0);
  const rows=fs.readdirSync(dir).filter(f=>f.endsWith('-result.json')).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f))));
  expect(rows.filter(r=>r.status==='skipped')).toHaveLength(6);
  expect(rows.filter(r=>r.status==='broken')).toHaveLength(1);
  expect(rows.some(r=>r.status==='passed')).toBe(false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
it('iOS proxy permits only the approved production destination',()=>{
 const {target}=require('../../scripts/e2e/native/proxy.cjs');
 expect(target('cpzgnhchdpkxnebjsyyi')).toBe('https://cpzgnhchdpkxnebjsyyi.supabase.co');
 expect(()=>target('localhost:54321')).toThrow();
 expect(()=>target('')).toThrow();
 expect(()=>target('abcdefghijklmnopqrst')).toThrow();
});
it('production public constants remain readable by existing release checks',()=>{
 const {sourceConstant}=require('../../scripts/verify-production-workout-rpc.cjs');
 const source=fs.readFileSync('lib/supabase.ts','utf8');
 expect(sourceConstant(source,'SUPABASE_URL')).toBe('https://cpzgnhchdpkxnebjsyyi.supabase.co');
 expect(sourceConstant(source,'SUPABASE_ANON_KEY').split('.')).toHaveLength(3);
});
it('recovery manifest rejects another account, baseline data and foreign weekly snapshots',()=>{
 const script=`
 const assert=require('node:assert/strict');
 const {validate,USER}=require('./scripts/e2e/native/fixtures.cjs');
 const id='12345678-1234-1234-1234-123456789abc',marker='Maestro '+id;
 const make=()=>({version:1,userId:USER,runId:id,marker,
 templates:Object.fromEntries(['workout','recovery','plans'].map(k=>[k,{id,title:marker+' '+k}])),
 planTitle:marker+' plan',editedTitle:marker+' edited',caption:marker+' private post',
 profile:{active_plan_id:null},baseline:{counts:{workout_history:0,posts:0,plans:0,goals:0,live_workout_drafts:0},templates:[]},saves:[id,id],weekKey:'2026-10-25',weekly:[]});
 assert.equal(validate(make()).userId,USER);
 for(const mutate of [m=>m.userId='someone-else',m=>m.baseline.counts.workout_history=1,
 m=>m.templates.workout.title='unrelated',m=>m.baseline.templates=[id],
 m=>m.weekly=[{user_id:'other',week_key:m.weekKey}]]){
 const m=make();mutate(m);assert.throws(()=>validate(m));}
 `;
 const result=spawnSync(process.execPath,['-e',script],{encoding:'utf8'});
 expect(result.stderr).toBe('');expect(result.status).toBe(0);
});
it('hard timeout stops a command that ignores normal termination',()=>{
 const start=Date.now();
 const result=spawnSync('python3',['scripts/e2e/native/bounded-command.py','0.3','python3','-c',
  'import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(60)'],{encoding:'utf8',timeout:5000});
 expect(result.status).toBe(124);
 expect(result.stderr).toContain('terminating process group');
 expect(Date.now()-start).toBeLessThan(4000);
});
it('bounded command preserves an ordinary failure exit code',()=>{
 const result=spawnSync('python3',['scripts/e2e/native/bounded-command.py','2','python3','-c','raise SystemExit(7)']);
 expect(result.status).toBe(7);
});
