import {searchHotels,reconcileHotelSearches} from './hotel-search';
import { config } from 'dotenv';
import { resolve } from 'node:path';
config({path:resolve(process.cwd(),'../../.env')});
import { Queue,Worker } from 'bullmq';
import { prisma,Prisma } from '@tripsaathi/database';

import { executeSandbox } from './execution';
import { jobIdentity } from './job-identity';
import {startResearch,researchTick} from './research';
import {reconcileResearch,reconciliationMaintenance} from './research-recovery';
import {researchControl} from '@tripsaathi/domain';
import {searchFlights,reconcileFlightSearches} from './flight-search';
import {monitoringTick} from './monitoring';
import {explainPlan,reconcileExplanations} from './explanation';
import {extractImport,importMaintenance} from './imports';
import {deliverNotifications} from './notifications';
import {WorkerHeartbeat} from './heartbeat';
const heartbeat=new WorkerHeartbeat();heartbeat.start();
const redis=new URL(process.env.REDIS_URL||'redis://127.0.0.1:6379');
const connection={host:redis.hostname,port:Number(redis.port||6379),maxRetriesPerRequest:null};
const queue=new Queue('tripsaathi',{connection});
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
async function ensureJob(type:string,payload:Record<string,unknown>,fallbackId:string){
  const key=jobIdentity(type,payload,fallbackId);
  const prior=await queue.getJob(key);
  if(prior){const state=await prior.getState();if(state==='failed'||state==='completed')await prior.remove();else return;}
  await queue.add(type,payload,{jobId:key,attempts:type==='EXECUTE_SANDBOX'?3:1,backoff:{type:'exponential',delay:1000}});
}
let busy=false;
async function tick(){if(busy)return;busy=true;try{
  const outbox=await prisma.outbox.findMany({where:{dispatchedAt:null},orderBy:{createdAt:'asc'},take:20});
  for(const event of outbox){await ensureJob(event.type,event.payload as Record<string,unknown>,event.id);await prisma.outbox.update({where:{id:event.id},data:{dispatchedAt:new Date()}});}
  // Reconcile undelivered state after queue loss; handlers use persistent status and stable keys.
  const approved=await prisma.recoveryPlan.findMany({where:{status:'APPROVED'},select:{id:true},take:20});for(const p of approved)await ensureJob('EXECUTE_SANDBOX',{planId:p.id},p.id);
  const pending=await prisma.agentTask.findMany({where:{status:'QUEUED'},select:{id:true,kind:true},take:10});for(const task of pending)await ensureJob(task.kind==='PLAN_EXPLANATION'?'PLAN_EXPLANATION':task.kind==='SERPAPI_HOTEL_SEARCH'?'SERPAPI_HOTEL_SEARCH':task.kind==='SERPAPI_FLIGHT_SEARCH'?'SERPAPI_FLIGHT_SEARCH':'TINYFISH_POLICY',{taskId:task.id},task.id);
  await reconciliationMaintenance();
  const inspections=await prisma.agentTask.findMany({where:{kind:{in:["PUBLIC_POLICY","PUBLIC_ALTERNATIVES"]},context:{path:["_control","reconciliation","state"],equals:"QUEUED"}},take:10});for(const task of inspections){const request=researchControl(task.context)?.reconciliation;if(request)await ensureJob("TINYFISH_RECONCILE",{taskId:task.id,requestId:request.requestId},request.requestId);}
  await researchTick();
  await reconcileExplanations();await reconcileFlightSearches();await reconcileHotelSearches();
  const imports=await prisma.documentImport.findMany({where:{status:'QUEUED'},select:{id:true},take:10});for(const doc of imports)await ensureJob('DOCUMENT_EXTRACT',{importId:doc.id},doc.id);
  await importMaintenance();await deliverNotifications();heartbeat.complete("dispatch",true);
}catch(error){heartbeat.complete('dispatch',false);console.error('Worker tick:',error instanceof Error?error.message:error);}finally{busy=false;}}
const worker=new Worker('tripsaathi',async job=>{if(job.name==='EXECUTE_SANDBOX')await executeSandbox(job.data.planId);else if(job.name==='TINYFISH_POLICY')await startResearch(job.data.taskId);else if(job.name==='PLAN_EXPLANATION')await explainPlan(job.data.taskId);else if(job.name==='TINYFISH_RECONCILE')await reconcileResearch(job.data.taskId,job.data.requestId);else if(job.name==='SERPAPI_HOTEL_SEARCH')await searchHotels(job.data.taskId);else if(job.name==='SERPAPI_FLIGHT_SEARCH')await searchFlights(job.data.taskId);else if(job.name==='DOCUMENT_EXTRACT')await extractImport(job.data.importId);},{connection,concurrency:2});
worker.on('failed',(job,error)=>console.error('Job failed',job?.id,error.message));
const timer=setInterval(()=>void tick(),4000);void tick();console.log('TripSaathi worker started. Transactions are sandbox only.');
let monitoringBusy=false;
async function monitorTick(){if(monitoringBusy)return;monitoringBusy=true;try{await monitoringTick();heartbeat.complete("monitoring",true);}catch{heartbeat.complete("monitoring",false);console.error('Monitoring scheduler temporarily failed');}finally{monitoringBusy=false;}}
const monitoringTimer=setInterval(()=>void monitorTick(),10000);void monitorTick();
async function shutdown(){clearInterval(timer);clearInterval(monitoringTimer);await heartbeat.stop();await worker.close();await queue.close();await prisma.$disconnect();process.exit(0);}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);



