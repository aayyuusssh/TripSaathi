import {config} from 'dotenv';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
config();const require=createRequire(import.meta.url);
const {TripsService}=require('../apps/api/dist/trips.service.js');const {MonitoringService}=require('../apps/api/dist/monitoring.service.js');
const {prisma}=require('../apps/worker/node_modules/@tripsaathi/database/dist/index.js');
const {pollSubscription,ingestObservation}=require('../apps/worker/dist/monitoring.js');
const {startResearch,inspectResearch}=require('../apps/worker/dist/research.js');
const {demoTrip}=require('../packages/domain/dist/index.js');
const service=new TripsService(),monitor=new MonitoringService(),owner='test-monitoring-'+randomUUID();
try{
 let trip=await service.create(demoTrip('FLIGHT'),owner);const item=trip.items.find(i=>i.category==='FLIGHT');
 const sub=await prisma.monitoringSubscription.create({data:{tripId:trip.id,itemId:item.id,providerId:'TEST_FLIGHTAWARE',itemRevision:item.revision,nextCheckAt:new Date(),windowEndsAt:new Date(Date.now()+86400000),dailyLimit:4}});
 let calls=0;const response={delayMinutes:60,serviceStatus:'DELAYED',source:'Synthetic provider regression fixture',provenance:'LIVE',providerId:'FLIGHTAWARE',providerFlightId:'test-service-instance',estimatedArrivalAt:new Date(item.endsAt.getTime()+3600000).toISOString(),actualArrivalAt:null,arrivalLocation:'BOM'};
 const fake={async status(){calls++;return{...response,observedAt:new Date().toISOString()};}};
 await Promise.all(Array.from({length:5},()=>pollSubscription(sub.id,fake,true)));assert.equal(calls,1,'Concurrent schedulers must reserve one paid check');
 trip=await service.get(trip.id,owner);const revision=trip.revision;assert.equal(revision,2);
 assert.equal(trip.observations.at(-1).disposition,'ACCEPTED');
 await assert.rejects(()=>monitor.list(trip.id,'foreign'),/Trip not found/);
 const publicMonitoring=await monitor.list(trip.id,owner);assert.equal('leaseToken' in publicMonitoring.records[0],false);
 const current=await prisma.monitoringSubscription.findUnique({where:{id:sub.id}});assert.equal(current.callsToday,1);
 await prisma.monitoringSubscription.update({where:{id:sub.id},data:{nextCheckAt:new Date()}});await pollSubscription(sub.id,fake,true);
 assert.equal((await service.get(trip.id,owner)).revision,revision,'Identical status refresh must preserve plan revision');
 let token=randomUUID();await prisma.monitoringSubscription.update({where:{id:sub.id},data:{leaseToken:token,leaseUntil:new Date(Date.now()+60000)}});
 const last=await prisma.statusObservation.findFirst({where:{tripId:trip.id,disposition:'ACCEPTED'},orderBy:{observedAt:'desc'}});
 await ingestObservation(sub.id,token,{...response,delayMinutes:180,observedAt:last.observedAt.toISOString()});
 assert.equal((await service.get(trip.id,owner)).revision,revision,'Conflicting same-time update cannot overwrite current status');
 assert.equal(await prisma.statusObservation.count({where:{tripId:trip.id,disposition:'CONFLICT'}}),1);
 await prisma.monitoringSubscription.update({where:{id:sub.id},data:{usageDay:new Date().toISOString().slice(0,10),callsToday:4,nextCheckAt:new Date(),leaseUntil:null,leaseToken:null}});await pollSubscription(sub.id,fake,true);assert.equal(calls,2,'Request cap must prevent external dispatch');
 const edited={id:item.id,category:'FLIGHT',label:item.label,provider:item.provider,timezone:item.timezone,startsAt:item.startsAt.toISOString(),endsAt:item.endsAt.toISOString(),details:item.details};
 trip=await service.editItem(trip.id,item.id,owner,{item:edited,expectedRevision:trip.revision,mutationKey:randomUUID()});
 await prisma.monitoringSubscription.update({where:{id:sub.id},data:{nextCheckAt:new Date()}});await pollSubscription(sub.id,fake,true);assert.equal((await prisma.monitoringSubscription.findUnique({where:{id:sub.id}})).state,'NEEDS_RECONFIRMATION');
 // Research fixtures inject a fake client; no TinyFish credit is spent.
 const task=await prisma.agentTask.create({data:{tripId:trip.id,revision:trip.revision,kind:'PUBLIC_ALTERNATIVES',url:'https://www.ihg.com/hotels/gb/en/reservation',context:{destination:'Test city'},callbackToken:'0'.repeat(64)}});
 const fakeResearch={async start(){return 'fixture-run';},async inspect(){return{status:'COMPLETED',result:{outcome:'BLOCKED',summary:'Synthetic blocked-site fixture',facts:[],unknowns:['Availability unknown'],candidates:[]}};}};
 await startResearch(task.id,fakeResearch);await inspectResearch(task.id,fakeResearch);
 assert.equal((await prisma.agentTask.findUnique({where:{id:task.id}})).status,'COMPLETED');
 assert.equal('callbackToken' in (await service.get(trip.id,owner)).tasks.find(t=>t.id===task.id),false);
 const old=await prisma.agentTask.create({data:{tripId:trip.id,revision:trip.revision-1,kind:'PUBLIC_POLICY',url:'https://www.goindigo.in/'}});let starts=0;
 await startResearch(old.id,{async start(){starts++;return'never';}});assert.equal(starts,0);assert.equal((await prisma.agentTask.findUnique({where:{id:old.id}})).status,'SUPERSEDED');
 await monitor.pause(trip.id,item.id,owner);
 if(process.env.TINYFISH_API_KEY){
  const capped=await service.create(demoTrip('FLIGHT'),owner);const hotel=capped.items.find(i=>i.category==='HOTEL');
  await prisma.agentTask.createMany({data:[1,2].map(()=>({tripId:capped.id,revision:1,kind:'PLAN_EXPLANATION',status:'COMPLETED',url:'https://generativelanguage.googleapis.com/'}))}); // Separate provider reservations must not consume TinyFish's cap.
  const first=await service.research(capped.id,owner,{provider:'INDIGO'});
  assert.equal((await service.research(capped.id,owner,{provider:'INDIGO'})).id,first.id,'Repeated queued research must reuse the same reservation');
  await service.research(capped.id,owner,{provider:'INDIGO',kind:'PUBLIC_ALTERNATIVES'});
  await service.research(capped.id,owner,{provider:'IHG',kind:'PUBLIC_ALTERNATIVES',itemId:hotel.id});
  await prisma.agentTask.updateMany({where:{tripId:capped.id},data:{status:'SUPERSEDED'}});
  if((Number(process.env.TINYFISH_TRIP_DAILY_RUN_LIMIT)||3)===3)await assert.rejects(()=>service.research(capped.id,owner,{provider:'INDIGO'}),/run cap/);
 }
 console.log('PASS: concurrent check reservation, live revision/freshness, same-time conflict rejection, request caps, edit invalidation, owner isolation, callback-token redaction, blocked research persistence, no stale research dispatch.');
 console.log('Retained hidden synthetic fixture:',trip.id);
}finally{await prisma.monitoringSubscription.updateMany({where:{trip:{ownerId:owner},state:'ACTIVE'},data:{state:'PAUSED',leaseToken:null,leaseUntil:null}});await prisma.agentTask.updateMany({where:{trip:{ownerId:owner},status:'QUEUED'},data:{status:'SUPERSEDED'}});await prisma.$disconnect();}
