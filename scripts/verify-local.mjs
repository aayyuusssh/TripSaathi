// Uses only synthetic provider fixtures. Requires compiled apps and local PG/Redis.
import {spawn} from 'node:child_process';import {mkdirSync,writeFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import {dirname,resolve} from 'node:path';import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';import {config} from 'dotenv';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
config({path:resolve(root,'.env')});
const base=process.env.DATABASE_URL;if(!base)throw Error('DATABASE_URL is required');const database=new URL(base);if(!['127.0.0.1','localhost','[::1]'].includes(database.hostname))throw Error('Verification requires a local PostgreSQL database');
const schema='tripsaathi_verify_'+randomUUID().replaceAll('-','');database.searchParams.set('schema',schema);const environment={...process.env,DATABASE_URL:database.toString()};
const scripts=['web-loopback-regression.cjs','itinerary-regression.mjs','worker-concurrency.mjs','monitoring-regression.mjs','recovery-regression.mjs','research-recovery-regression.mjs','import-regression.mjs','alternative-providers-regression.mjs','hotel-search-regression.mjs','hotel-fallback-regression.mjs','flight-fallback-regression.mjs','release-regression.mjs'];
const results=[];let cleaned=false;
async function run(args){return new Promise(done=>{const child=spawn(process.execPath,args,{cwd:root,env:environment,windowsHide:true,stdio:'ignore'});const timer=setTimeout(()=>child.kill(),180000);child.on('error',()=>{clearTimeout(timer);done({status:'FAILED',reason:'Unable to start verification process'});});child.on('close',code=>{clearTimeout(timer);done({status:code===0?'PASS':'FAILED',reason:code===0?null:'Verification failed; inspect the relevant script with an isolated test database'});});});}
try{
 const migration=await run([resolve(root,'node_modules/prisma/build/index.js'),'migrate','deploy','--schema',resolve(root,'packages/database/prisma/schema.prisma')]);if(migration.status!=='PASS')throw Error('Unable to migrate isolated verification schema');console.log('Isolated local PostgreSQL verification schema ready.');
 for(const script of scripts){const started=Date.now(),result=await run([resolve(root,'scripts',script)]);results.push({script,...result,durationMs:Date.now()-started});console.log(`${result.status}: ${script}`);}
}catch{results.push({script:'isolated-database-setup',status:'FAILED',reason:'Isolated verification setup failed'});process.exitCode=1;}
finally{
 const require=createRequire(import.meta.url),{PrismaClient}=require('@prisma/client'),db=new PrismaClient({datasources:{db:{url:base}}});
 try{if(!/^tripsaathi_verify_[a-f0-9]{32}$/.test(schema)||database.searchParams.get('schema')!==schema)throw Error('Invalid verification schema');await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');cleaned=true;}catch{console.log('Verification schema cleanup failed; no application schema was targeted.');process.exitCode=1;}finally{await db.$disconnect();}
 const proof={checkedAt:new Date().toISOString(),scope:'LOCAL_SYNTHETIC_ACCEPTANCE',isolatedDatabase:true,testSchemaCleaned:cleaned,externalProviderCalls:false,results,browserLogin:'REQUIRES_HUMAN_ACCEPTANCE',supplierTransactions:'NOT_IMPLEMENTED'};mkdirSync(resolve(root,'verification'),{recursive:true});writeFileSync(resolve(root,'verification/local-acceptance.json'),JSON.stringify(proof,null,2));if(results.some(r=>r.status!=='PASS'))process.exitCode=1;console.log('Sanitized result: verification/local-acceptance.json');
}
