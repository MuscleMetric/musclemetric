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
  expect(config().android.package).toBe('com.musclemetric.app');
  process.env.EXPO_PUBLIC_NATIVE_E2E='true';
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  expect(()=>config()).toThrow('local Supabase');
  process.env.EXPO_PUBLIC_SUPABASE_URL='https://production.supabase.co';
  expect(()=>config()).toThrow('local Supabase');
  process.env.EXPO_PUBLIC_SUPABASE_URL='http://10.0.2.2:54321';
  expect(config().android.package).toBe('com.musclemetric.app.e2e');
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
