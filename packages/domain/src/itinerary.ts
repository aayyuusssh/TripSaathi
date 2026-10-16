import { z } from 'zod';
export const categorySchema=z.enum(['FLIGHT','RAIL','HOTEL','TRANSFER']);
export type Category=z.infer<typeof categorySchema>;
export function validTimezone(value:string):boolean{try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}}
export const timezoneSchema=z.string().refine(validTimezone,'Use a valid IANA timezone');
const dateOnly=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v,'Invalid calendar date');
const code=z.string().trim().toUpperCase();
const airport=code.regex(/^[A-Z]{3}$/,'Airport code must contain three letters');
const station=code.regex(/^[A-Z0-9]{2,8}$/,'Use a valid station-code format');
export const locationSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('AIRPORT'),code:airport,label:z.string().min(1),timezone:timezoneSchema}),
  z.object({kind:z.literal('STATION'),code:station,label:z.string().min(1),timezone:timezoneSchema}),
  z.object({kind:z.literal('ADDRESS'),label:z.string().min(2).max(250),timezone:timezoneSchema}),
]);
export type Location=z.infer<typeof locationSchema>;
export const detailSchemas={
  FLIGHT:z.object({flightNumber:z.string().trim().min(2).max(20),departure:airport,arrival:airport,ticketStatus:z.enum(['CONFIRMED','UNKNOWN']).default('UNKNOWN'),arrivalTimezone:timezoneSchema.optional()}).passthrough(),
  RAIL:z.object({trainNumber:z.string().regex(/^(\d{5}|DEMO\d+)$/,'Train number must be five digits'),sourceDate:dateOnly,boardingDate:dateOnly,boardingStation:station,destinationStation:station,travelClass:z.string().min(1).max(20).default('UNKNOWN'),quota:z.string().min(1).max(20).default('UNKNOWN'),reservationStatus:z.enum(['CONFIRMED','RAC','WAITLISTED','UNKNOWN'])}).passthrough(),
  HOTEL:z.object({property:z.string().min(2).max(200),location:z.string().min(2).max(250),occupancy:z.number().int().min(1).max(20).default(1),bookingStatus:z.enum(['CONFIRMED','REQUESTED','UNKNOWN']).default('UNKNOWN')}).passthrough(),
  TRANSFER:z.object({pickupLocation:z.string().min(2).max(250),dropoffLocation:z.string().min(2).max(250),capacity:z.number().int().min(1).max(50),bookingStatus:z.enum(['CONFIRMED','REQUESTED','UNKNOWN']).default('UNKNOWN')}).passthrough(),
};
export function localDate(instant:string,timezone:string):string{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant));const p=(type:string)=>parts.find(v=>v.type===type)?.value;return `${p('year')}-${p('month')}-${p('day')}`;}
export const itemSchema=z.object({id:z.string().min(1).max(100),category:categorySchema,label:z.string().min(1).max(200),provider:z.string().min(1).max(100),startsAt:z.string().datetime(),endsAt:z.string().datetime(),timezone:timezoneSchema.default('Asia/Kolkata'),details:z.record(z.unknown()).default({}),revision:z.number().int().positive().optional()}).superRefine((item,ctx)=>{
  if(Date.parse(item.endsAt)<Date.parse(item.startsAt))ctx.addIssue({code:'custom',path:['endsAt'],message:'End must be after start'});
  const parsed=detailSchemas[item.category].safeParse(item.details);
  if(!parsed.success){for(const issue of parsed.error.issues)ctx.addIssue({...issue,path:['details',...issue.path]});return;}
  if(item.category==='FLIGHT'&&parsed.data.departure===parsed.data.arrival)ctx.addIssue({code:'custom',path:['details','arrival'],message:'Departure and arrival airport must differ'});
  if(item.category==='RAIL'){
    const d=parsed.data as z.infer<typeof detailSchemas.RAIL>;
    if(d.boardingStation===d.destinationStation)ctx.addIssue({code:'custom',path:['details','destinationStation'],message:'Boarding and destination station must differ'});
    if(d.sourceDate>d.boardingDate)ctx.addIssue({code:'custom',path:['details','sourceDate'],message:'Train source date cannot be after boarding date'});
    if(validTimezone(item.timezone)&&d.boardingDate!==localDate(item.startsAt,item.timezone))ctx.addIssue({code:'custom',path:['details','boardingDate'],message:'Boarding date must match departure in the item timezone'});
  }
}).transform(item=>({...item,details:detailSchemas[item.category].parse(item.details)}));
// Stored legacy records may have incomplete details; new writes always pass itemSchema.
export type ItineraryItem=Omit<z.infer<typeof itemSchema>,'details'>&{details:Record<string,unknown>};
export const dependencySchema=z.object({fromItemId:z.string(),toItemId:z.string(),bufferMinutes:z.number().int().min(0).max(1440),deadline:z.string().datetime(),confirmed:z.boolean(),kind:z.enum(['CONNECTION','PICKUP','CHECK_IN']),bufferSource:z.enum(['ASSUMED','USER_CONFIRMED','PROVIDER_POLICY','ROUTING_API']).default('ASSUMED'),protection:z.enum(['SELF_TRANSFER','THROUGH_BOOKING','UNKNOWN']).default('UNKNOWN'),evidenceUrl:z.string().url().optional()}).superRefine((d,ctx)=>{if(d.bufferSource==='PROVIDER_POLICY'&&!d.evidenceUrl)ctx.addIssue({code:'custom',path:['evidenceUrl'],message:'Policy-sourced buffer needs its source URL'});});
export type DependencyInput=z.infer<typeof dependencySchema>;
export function validateGraph(items:ItineraryItem[],dependencies:DependencyInput[]):string[]{
  const errors:string[]=[];const ids=new Set(items.map(i=>i.id));if(ids.size!==items.length)errors.push('Duplicate itinerary item IDs');
  const keys=new Set<string>();const edges=new Map<string,string[]>();
  for(const dep of dependencies){
    const key=[dep.fromItemId,dep.toItemId,dep.kind].join('|');if(keys.has(key))errors.push('Duplicate connection');keys.add(key);
    if(!ids.has(dep.fromItemId)||!ids.has(dep.toItemId)){errors.push('Dependency references a missing item');continue;}
    const target=items.find(i=>i.id===dep.toItemId)!;
    if(dep.kind==='CONNECTION'&&!['FLIGHT','RAIL'].includes(target.category))errors.push('Connection must lead to a flight or train');
    if(dep.kind==='PICKUP'&&target.category!=='TRANSFER')errors.push('Pickup must lead to a transfer');
    if(dep.kind==='CHECK_IN'&&target.category!=='HOTEL')errors.push('Check-in must lead to a hotel');
    if(dep.kind==='CONNECTION'&&Date.parse(dep.deadline)>Date.parse(target.startsAt))errors.push('Reporting deadline cannot be after onward departure');
    edges.set(dep.fromItemId,[...(edges.get(dep.fromItemId)??[]),dep.toItemId]);
  }
  const seen=new Set<string>();const active=new Set<string>();
  function visit(id:string):boolean{if(active.has(id))return true;if(seen.has(id))return false;active.add(id);for(const next of edges.get(id)??[])if(visit(next))return true;active.delete(id);seen.add(id);return false;}
  if([...ids].some(visit))errors.push('Trip dependencies must not contain cycles');return errors;
}
export const createTripSchema=z.object({title:z.string().min(3).max(150),destination:z.string().min(2).max(100),budgetMinor:z.number().int().min(0).max(100000000),currency:z.literal('INR').default('INR'),items:z.array(itemSchema).min(1).max(30),dependencies:z.array(dependencySchema).max(60)}).superRefine((trip,ctx)=>{for(const message of validateGraph(trip.items,trip.dependencies))ctx.addIssue({code:'custom',message});});
export type TripInput=z.infer<typeof createTripSchema>;
export function itemLocations(item:ItineraryItem):{origin:Location;destination:Location}{
  const d=item.details;const timezone=item.timezone;
  if(item.category==='FLIGHT')return{origin:locationSchema.parse({kind:'AIRPORT',code:d.departure,label:d.departure,timezone}),destination:locationSchema.parse({kind:'AIRPORT',code:d.arrival,label:d.arrival,timezone:typeof d.arrivalTimezone==='string'?d.arrivalTimezone:timezone})};
  if(item.category==='RAIL')return{origin:locationSchema.parse({kind:'STATION',code:d.boardingStation,label:d.boardingStation,timezone}),destination:locationSchema.parse({kind:'STATION',code:d.destinationStation,label:d.destinationStation,timezone})};
  const origin=String(item.category==='HOTEL'?d.location:d.pickupLocation);const destination=String(item.category==='HOTEL'?d.location:d.dropoffLocation);
  return{origin:locationSchema.parse({kind:'ADDRESS',label:origin,timezone}),destination:locationSchema.parse({kind:'ADDRESS',label:destination,timezone})};
}
