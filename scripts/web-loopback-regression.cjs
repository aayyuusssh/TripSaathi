// Exercise the installed Next adapter used by Clerk's same-origin rewrites.
const assert=require('node:assert/strict');
const path=require('node:path');
globalThis.AsyncLocalStorage=require('node:async_hooks').AsyncLocalStorage;
const {adapter}=require('next/dist/server/web/adapter');
const {NextResponse}=require('next/server');
const loadConfig=require('next/dist/server/config').default;
const {PHASE_DEVELOPMENT_SERVER}=require('next/constants');
(async()=>{
 const config=await loadConfig(PHASE_DEVELOPMENT_SERVER,path.resolve(__dirname,'../apps/web'));
 assert.equal(config.skipProxyUrlNormalize,true,'Clerk must preserve the original loopback origin');
 const prior=process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE;
 try{
  process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE='true';
  for(const origin of ['http://127.0.0.1:3000','http://localhost:3000']){
   for(const pathname of ['/','/api/v1/trips?cursor=example']){
    const url=origin+pathname;
    const result=await adapter({page:'/proxy',request:{url,method:'GET',headers:{host:new URL(origin).host},nextConfig:{}},handler:async req=>NextResponse.rewrite(req.url)});
    assert.equal(result.response.headers.get('x-middleware-rewrite'),url);
   }
  }
 }finally{if(prior===undefined)delete process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE;else process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE=prior;}
 console.log('PASS: configured Next proxy preserves loopback origins, page paths and API query strings. No auth bypass or external provider calls.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
