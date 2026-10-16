import {prisma,Prisma} from '@tripsaathi/database';
import {assessTrip,observationDisposition,nextPoll,flightStatusSettings,type Observation,type ItineraryItem,type DependencyInput,type FlightIdentity} from '@tripsaathi/domain';
import {createHash,randomUUID} from 'node:crypto';
import {FlightAwareClient} from './integrations/flightaware';
import {AirLabsClient} from './integrations/airlabs';
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
async function serial<T>(fn:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{for(let attempt=0;attempt<4;attempt++){try{return await prisma.$transaction(fn,{isolationLevel:'ReadCommitted',timeout:10000});}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&(['P2034','P2002'].includes(e.code)||e.code==='P2010'&&['40001','40P01'].includes(String(e.meta?.code)))&&attempt<3){await new Promise(done=>setTimeout(done,25*2**attempt));continue;}throw e;}}throw new Error('Concurrent monitoring update');}
export async function ingestObservation(subscriptionId:string,leaseToken:string,observation:Omit<Observation,'itemId'>){return serial(async tx=>{
 const found=await tx.monitoringSubscription.findUnique({where:{id:subscriptionId}});if(!found)return{ignored:true};
 await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id"=${found.tripId} FOR UPDATE`;
 const sub=await tx.monitoringSubscription.findUnique({where:{id:subscriptionId},include:{item:true,trip:{include:{items:true,dependencies:true,observations:{orderBy:[{observedAt:'asc'},{receivedAt:'asc'}]}}}}});
 if(!sub||sub.leaseToken!==leaseToken||sub.state!=='ACTIVE'||sub.itemRevision!==sub.item.revision)return{ignored:true};
 const previous=sub.trip.observations.filter(o=>o.itemId===sub.itemId&&o.itemRevision===sub.itemRevision&&o.providerId===sub.providerId&&o.disposition==='ACCEPTED').at(-1);
 const prior=previous?{...previous,observedAt:previous.observedAt.toISOString(),estimatedArrivalAt:previous.estimatedArrivalAt?.toISOString(),actualArrivalAt:previous.actualArrivalAt?.toISOString()} as Observation:undefined;
 const candidate={...observation,itemId:sub.itemId,itemRevision:sub.itemRevision};
 const lastAccepted=sub.trip.observations.filter(o=>o.itemId===sub.itemId&&o.itemRevision===sub.itemRevision&&o.provenance==='LIVE'&&o.disposition==='ACCEPTED').at(-1);
 const comparison=lastAccepted?{...lastAccepted,observedAt:lastAccepted.observedAt.toISOString(),estimatedArrivalAt:lastAccepted.estimatedArrivalAt?.toISOString(),actualArrivalAt:lastAccepted.actualArrivalAt?.toISOString()} as Observation:prior;
 const disposition=observationDisposition(candidate,comparison);
 const materiallyChanged=!prior||candidate.serviceStatus!==prior.serviceStatus||candidate.delayMinutes!==prior.delayMinutes||(candidate.estimatedArrivalAt??null)!==(prior.estimatedArrivalAt??null)||(candidate.actualArrivalAt??null)!==(prior.actualArrivalAt??null)||(candidate.arrivalLocation??null)!==(prior.arrivalLocation??null);
 const eventKey='live-'+createHash('sha256').update(JSON.stringify([sub.id,sub.itemRevision,candidate])).digest('hex');
 if(await tx.statusObservation.findUnique({where:{eventKey}}))return{duplicate:true};
 const row=await tx.statusObservation.create({data:{tripId:sub.tripId,itemId:sub.itemId,itemRevision:sub.itemRevision,eventKey,delayMinutes:candidate.delayMinutes,serviceStatus:candidate.serviceStatus??'SCHEDULED',source:candidate.source,provenance:candidate.provenance,providerId:sub.providerId,providerFlightId:candidate.providerFlightId,observedAt:new Date(candidate.observedAt),actualArrivalAt:candidate.actualArrivalAt?new Date(candidate.actualArrivalAt):null,estimatedArrivalAt:candidate.estimatedArrivalAt?new Date(candidate.estimatedArrivalAt):null,arrivalLocation:candidate.arrivalLocation,disposition}});
 if(disposition!=='ACCEPTED'){
  await tx.monitoringSubscription.update({where:{id:sub.id},data:{lastError:`Observation rejected: ${disposition}`,lastCheckedAt:new Date(),leaseUntil:null,leaseToken:null,nextCheckAt:nextPoll(sub.item.startsAt.toISOString(),sub.item.endsAt.toISOString(),candidate.delayMinutes,1)}});
  await tx.tripEvent.create({data:{tripId:sub.tripId,type:'STATUS_REJECTED',message:`Provider observation recorded as ${disposition}; current status was preserved.`,provenance:'LIVE'}});return{disposition};
 }
 await tx.monitoringSubscription.update({where:{id:sub.id},data:{providerFlightId:candidate.providerFlightId,lastCheckedAt:new Date(),lastSuccessAt:new Date(),lastError:null,failures:0,leaseUntil:null,leaseToken:null,nextCheckAt:nextPoll(sub.item.startsAt.toISOString(),sub.item.endsAt.toISOString(),candidate.delayMinutes),state:candidate.serviceStatus==='ARRIVED'?'COMPLETED':'ACTIVE'}});
 // Same status refreshes freshness without repeatedly invalidating reviewed plans.
 if(materiallyChanged){
  const revision=sub.trip.revision+1;await tx.trip.update({where:{id:sub.tripId},data:{revision}});
  await tx.recoveryPlan.updateMany({where:{tripId:sub.tripId,status:{in:['AWAITING_APPROVAL','APPROVED']}},data:{status:'SUPERSEDED'}});
  const items=sub.trip.items.map(i=>({...i,startsAt:i.startsAt.toISOString(),endsAt:i.endsAt.toISOString()})) as unknown as ItineraryItem[];
  const deps=sub.trip.dependencies.map(d=>({...d,deadline:d.deadline.toISOString()})) as unknown as DependencyInput[];
  const obs=[...sub.trip.observations,row].map(o=>({...o,observedAt:o.observedAt.toISOString(),actualArrivalAt:o.actualArrivalAt?.toISOString(),estimatedArrivalAt:o.estimatedArrivalAt?.toISOString()})) as Observation[];
  await tx.assessment.create({data:{tripId:sub.tripId,revision,result:json(assessTrip(items,deps,obs))}});
  await tx.tripEvent.create({data:{tripId:sub.tripId,type:'LIVE_STATUS_CHANGED',message:`${sub.item.label}: ${candidate.serviceStatus?.toLowerCase()}, ${candidate.delayMinutes} min versus imported arrival. Connected arrangements reassessed.`,provenance:'LIVE'}});
 }
 return{disposition,materiallyChanged};
});}
export async function pollSubscription(id:string,client?:Pick<FlightAwareClient,'status'>,configured?:boolean,settingsOverride?:ReturnType<typeof flightStatusSettings>){
 const leaseToken=randomUUID();const now=new Date(),day=now.toISOString().slice(0,10);
 const claimed=await serial(async tx=>{
  const initial=await tx.monitoringSubscription.findUnique({where:{id}});if(!initial)return null;
  await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id"=${initial.tripId} FOR UPDATE`;
  const sub=await tx.monitoringSubscription.findUnique({where:{id},include:{item:true}});
  if(!sub||sub.state!=='ACTIVE'||sub.nextCheckAt>now||sub.leaseUntil&&sub.leaseUntil>now)return null;
  if(sub.itemRevision!==sub.item.revision||sub.windowEndsAt<now){await tx.monitoringSubscription.update({where:{id},data:{state:sub.itemRevision!==sub.item.revision?'NEEDS_RECONFIRMATION':'EXPIRED',leaseToken:null,leaseUntil:null}});return null;}
  const settings=settingsOverride??flightStatusSettings(process.env,sub.providerId==="AIRLABS"?"AIRLABS":"FLIGHTAWARE");
  if(!(configured??settings.configured)){await tx.monitoringSubscription.update({where:{id},data:{lastError:settings.name+' key missing',nextCheckAt:new Date(Date.now()+30*60000)}});return null;}
  const tripSubs=await tx.monitoringSubscription.findMany({where:{tripId:sub.tripId,usageDay:day}});
  const used=tripSubs.reduce((sum,s)=>sum+s.callsToday,0);
  const tripLimit=Math.min(...(await tx.monitoringSubscription.findMany({where:{tripId:sub.tripId,state:'ACTIVE'}})).map(s=>s.dailyLimit));
  const tomorrow=new Date(day+'T00:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  const budget=await tx.providerUsage.upsert({where:{providerId_day:{providerId:sub.providerId,day}},create:{providerId:sub.providerId,day,calls:0},update:{}});
  await tx.$queryRaw`SELECT "id" FROM "ProviderUsage" WHERE "id"=${budget.id} FOR UPDATE`;
  const current=await tx.providerUsage.findUniqueOrThrow({where:{id:budget.id}});
  const globalLimit=settings.dailyLimit;
  if(settings.monthlyLimit){const month=day.slice(0,7);const monthly=await tx.providerUsage.upsert({where:{providerId_day:{providerId:sub.providerId,day:month}},create:{providerId:sub.providerId,day:month,calls:0},update:{}});await tx.$queryRaw`SELECT "id" FROM "ProviderUsage" WHERE "id"=${monthly.id} FOR UPDATE`;const usage=await tx.providerUsage.findUniqueOrThrow({where:{id:monthly.id}});if(usage.calls>=settings.monthlyLimit){await tx.monitoringSubscription.update({where:{id},data:{lastError:'Monthly provider request cap reached.',nextCheckAt:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1))}});return null;}}
  if(used>=tripLimit||current.calls>=globalLimit){await tx.monitoringSubscription.update({where:{id},data:{lastError:'Daily request cap reached; monitoring is paused until UTC reset.',nextCheckAt:tomorrow}});return null;}
  await tx.providerUsage.update({where:{id:budget.id},data:{calls:{increment:1}}});
  if(settings.monthlyLimit)await tx.providerUsage.update({where:{providerId_day:{providerId:sub.providerId,day:day.slice(0,7)}},data:{calls:{increment:1}}});
  await tx.monitoringSubscription.update({where:{id},data:{leaseToken,leaseUntil:new Date(Date.now()+60000),lastCheckedAt:now,usageDay:day,callsToday:sub.usageDay===day?sub.callsToday+1:1}});
  return sub;
 });
 if(!claimed)return;
 const d=claimed.item.details as Record<string,unknown>;
 const identity:FlightIdentity={flightNumber:String(d.flightNumber),departure:String(d.departure),arrival:String(d.arrival),startsAt:claimed.item.startsAt.toISOString(),endsAt:claimed.item.endsAt.toISOString(),providerFlightId:claimed.providerFlightId};
 const selected=client??(claimed.providerId==='AIRLABS'?new AirLabsClient(process.env.AIRLABS_API_KEY??''):new FlightAwareClient(process.env.FLIGHTAWARE_API_KEY??''));
 try{const observation=await selected.status(identity);await ingestObservation(id,leaseToken,observation);}
 catch(error){const message=error instanceof Error?error.message:'Provider check failed';await prisma.monitoringSubscription.updateMany({where:{id,leaseToken,state:'ACTIVE'},data:{leaseToken:null,leaseUntil:null,lastError:message.slice(0,250),failures:{increment:1},nextCheckAt:nextPoll(identity.startsAt,identity.endsAt,0,claimed.failures+1)}});}
}
export async function monitoringTick(){const due=await prisma.monitoringSubscription.findMany({where:{providerId:{in:['FLIGHTAWARE','AIRLABS']},state:'ACTIVE',nextCheckAt:{lte:new Date()},OR:[{leaseUntil:null},{leaseUntil:{lt:new Date()}}]},take:5,orderBy:{nextCheckAt:'asc'}});for(const sub of due)await pollSubscription(sub.id);}

