'use strict';
// Loopback-only bridge for the iOS simulator; never accepts an arbitrary destination.
const http=require('node:http'),https=require('node:https'),fs=require('node:fs');
const PRODUCTION_REF='cpzgnhchdpkxnebjsyyi';
function target(ref) {
  if(ref!==PRODUCTION_REF)throw Error('Only the approved production project is allowed');
  return 'https://'+ref+'.supabase.co';
}
function start() {
 const upstream=target(PRODUCTION_REF);
 const {anonKey:key}=require('./fixtures.cjs').config();
 return http.createServer((req,res)=>{
  if(fs.existsSync('ci-artifacts/native/offline')){res.writeHead(503);res.end('Injected test network interruption');return;}
  if(!/^\/(auth|rest)\/v1\//.test(req.url||'')){res.writeHead(404);res.end();return;}
  const headers={...req.headers,host:new URL(upstream).host,apikey:key};
  if(headers.authorization==='Bearer native-test-proxy')headers.authorization='Bearer '+key;
  const outgoing=https.request(upstream+req.url,{method:req.method,headers},response=>{
   res.writeHead(response.statusCode,response.headers);response.pipe(res);
  });
  outgoing.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Test upstream unavailable');});
  req.pipe(outgoing);
 }).listen(54321,'127.0.0.1');
}
module.exports={target,start};
if(require.main===module)start();
