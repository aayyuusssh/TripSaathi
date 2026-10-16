import {Injectable,BadRequestException,ConflictException} from '@nestjs/common';
import {prisma} from '@tripsaathi/database';
import {z} from 'zod';
import {monitoringFreshness,flightStatusSettings} from '@tripsaathi/domain';
import {getTrip,parsed,serial} from './trips.service';
const enableSchema=z.object({expectedRevision:z.number().int().positive(),dailyLimit:z.number().int().min(4).max(96).default(24)});
@Injectable()
export class MonitoringService{
 async list(id:string,ownerId:string){await getTrip(id,ownerId);const records=await prisma.monitoringSubscription.findMany({where:{tripId:id},include:{item:{select:{label:true,revision:true}}}});const settings=flightStatusSettings(process.env);return{providerConfigured:settings.configured,providerId:settings.providerId,providerName:settings.name,leadHours:settings.leadHours,dailyProviderLimit:settings.dailyLimit,monthlyProviderLimit:settings.monthlyLimit,railAvailable:false,records:records.map(({leaseToken,leaseUntil,...sub})=>({...sub,state:sub.item.revision!==sub.itemRevision?'NEEDS_RECONFIRMATION':sub.state,freshness:monitoringFreshness(sub.lastSuccessAt?.toISOString())}))};}
 async enable(id:string,itemId:string,ownerId:string,body:unknown){const input=parsed(enableSchema,body);const settings=flightStatusSettings(process.env);return serial(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id"=${id} AND "ownerId"=${ownerId} FOR UPDATE`;
  const trip=await getTrip(id,ownerId,tx);if(trip.revision!==input.expectedRevision)throw new ConflictException('Trip changed; refresh before enabling monitoring');
  const item=trip.items.find(i=>i.id===itemId);if(!item||item.category!=='FLIGHT'||item.validationVersion<2)throw new BadRequestException('Monitoring requires a complete flight arrangement');
  if(!settings.configured)throw new BadRequestException(settings.name+' key is not configured. Add its server key and restart.');
  const d=item.details as Record<string,unknown>;if(String(d.flightNumber).startsWith('DEMO'))throw new BadRequestException('Demo flight numbers cannot be monitored');
  if(Date.now()>item.endsAt.getTime()+24*3600000)throw new BadRequestException('This arrival is outside the monitoring window');
  const next=new Date(Math.max(Date.now(),item.startsAt.getTime()-settings.leadHours*3600000)),end=new Date(item.endsAt.getTime()+24*3600000);
  const existing=await tx.monitoringSubscription.findUnique({where:{itemId_providerId:{itemId,providerId:settings.providerId}}});
  await tx.monitoringSubscription.updateMany({where:{itemId,providerId:{not:settings.providerId},state:"ACTIVE"},data:{state:"PAUSED",leaseToken:null,leaseUntil:null}});
  if(existing?.state==='ACTIVE'&&existing.itemRevision===item.revision)return{enabled:true,alreadyEnabled:true};
  await tx.monitoringSubscription.upsert({where:{itemId_providerId:{itemId,providerId:settings.providerId}},create:{tripId:id,itemId,providerId:settings.providerId,itemRevision:item.revision,nextCheckAt:next,windowEndsAt:end,dailyLimit:input.dailyLimit},update:{state:'ACTIVE',itemRevision:item.revision,providerFlightId:null,nextCheckAt:next,windowEndsAt:end,dailyLimit:input.dailyLimit,leaseToken:null,leaseUntil:null,lastError:null,lastSuccessAt:null,failures:0}});
  await tx.tripEvent.create({data:{tripId:id,type:'MONITORING_ENABLED',message:`${settings.name} monitoring requested for ${item.label}; daily trip cap ${input.dailyLimit} requests (UTC reset). Coverage is pending provider verification.`,provenance:'USER_REPORTED'}});return{enabled:true};
 });}
 async pause(id:string,itemId:string,ownerId:string){return serial(async tx=>{await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id"=${id} AND "ownerId"=${ownerId} FOR UPDATE`;await getTrip(id,ownerId,tx);const changed=await tx.monitoringSubscription.updateMany({where:{tripId:id,itemId,state:'ACTIVE'},data:{state:'PAUSED',leaseToken:null,leaseUntil:null}});if(changed.count)await tx.tripEvent.create({data:{tripId:id,type:'MONITORING_PAUSED',message:'Automatic provider checks paused. Previous observations remain in history.',provenance:'USER_REPORTED'}});return{paused:true};});}
 async check(id:string,itemId:string,ownerId:string){const settings=flightStatusSettings(process.env);return serial(async tx=>{await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id"=${id} AND "ownerId"=${ownerId} FOR UPDATE`;await getTrip(id,ownerId,tx);const sub=await tx.monitoringSubscription.findUnique({where:{itemId_providerId:{itemId,providerId:settings.providerId}}});if(!sub||sub.tripId!==id||sub.state!=='ACTIVE')throw new BadRequestException('Enable monitoring first');if(sub.lastCheckedAt&&Date.now()-sub.lastCheckedAt.getTime()<5*60000)throw new ConflictException('Next manual check is available five minutes after the previous request');if((sub.lastError?.startsWith('Daily request cap')||sub.lastError?.startsWith('Monthly provider request cap')))throw new ConflictException('Daily request cap reached');await tx.monitoringSubscription.update({where:{id:sub.id},data:{nextCheckAt:new Date()}});return{queued:true};});}
}

