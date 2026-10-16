import {z} from 'zod';
import type {Observation} from './impact';
export const flightRecordSchema=z.object({fa_flight_id:z.string().min(1),ident:z.string(),ident_iata:z.string().nullable().optional(),ident_icao:z.string().nullable().optional(),codeshares:z.array(z.string()).nullable().optional(),codeshares_iata:z.array(z.string()).nullable().optional(),origin:z.object({code_iata:z.string().nullable().optional()}).nullable(),destination:z.object({code_iata:z.string().nullable().optional()}).nullable(),scheduled_out:z.string().datetime().nullable(),scheduled_in:z.string().datetime().nullable(),estimated_in:z.string().datetime().nullable(),actual_in:z.string().datetime().nullable(),cancelled:z.boolean(),diverted:z.boolean(),position_only:z.boolean().optional()}).passthrough();
export type FlightRecord=z.infer<typeof flightRecordSchema>;
export interface FlightIdentity{flightNumber:string;departure:string;arrival:string;startsAt:string;endsAt:string;providerFlightId?:string|null}
const ident=(v:string)=>v.replace(/\s/g,'').toUpperCase();
export function matchFlight(records:unknown,identity:FlightIdentity):FlightRecord{
 const body=z.object({flights:z.array(flightRecordSchema)}).parse(records);
 const matches=body.flights.filter(f=>!f.position_only&&f.scheduled_out&&Math.abs(Date.parse(f.scheduled_out)-Date.parse(identity.startsAt))<=5*60000&&f.origin?.code_iata===identity.departure&&
   (identity.providerFlightId?f.fa_flight_id===identity.providerFlightId:[f.ident,f.ident_iata,f.ident_icao,...f.codeshares??[],...f.codeshares_iata??[]].filter(Boolean).some(v=>ident(v!)===ident(identity.flightNumber)))&&
   (f.destination?.code_iata===identity.arrival||f.diverted));
 if(matches.length!==1)throw new Error(matches.length?'Ambiguous flight-instance match; confirm the service details.':'No exact flight-instance match for this route/departure.');
 return matches[0];
}
export function flightObservation(f:FlightRecord,identity:FlightIdentity,now=new Date()):Omit<Observation,'itemId'>{
 if(f.actual_in&&Date.parse(f.actual_in)>now.getTime()+300000)throw new Error('Provider actual arrival is in the future; status needs verification.');
 const eta=f.actual_in??f.estimated_in;const status=f.cancelled?'CANCELLED':f.diverted?'DIVERTED':f.actual_in?'ARRIVED':eta&&Date.parse(eta)>Date.parse(identity.endsAt)?'DELAYED':'SCHEDULED';
 if(!eta&&!f.cancelled&&!f.diverted)throw new Error('Provider has no gate-arrival estimate; scheduled time is not live confirmation.');
 return{delayMinutes:eta?Math.max(0,Math.ceil((Date.parse(eta)-Date.parse(identity.endsAt))/60000)):0,observedAt:now.toISOString(),source:'FlightAware AeroAPI gate-arrival status',provenance:'LIVE',serviceStatus:status,actualArrivalAt:f.actual_in,estimatedArrivalAt:eta,arrivalLocation:f.destination?.code_iata??null,providerId:'FLIGHTAWARE',providerFlightId:f.fa_flight_id};
}
export function observationDisposition(candidate:Observation,previous:Observation|undefined,now=Date.now()):'ACCEPTED'|'OUT_OF_ORDER'|'CONFLICT'|'INVALID_TIME'{
 const time=Date.parse(candidate.observedAt);if(!Number.isFinite(time)||time>now+300000||now-time>15*60000)return'INVALID_TIME';
 if(!previous)return'ACCEPTED';const prior=Date.parse(previous.observedAt);
 if(time<prior)return'OUT_OF_ORDER';
 const materiallyEqual=candidate.serviceStatus===previous.serviceStatus&&candidate.delayMinutes===previous.delayMinutes&&(candidate.estimatedArrivalAt??null)===(previous.estimatedArrivalAt??null)&&(candidate.actualArrivalAt??null)===(previous.actualArrivalAt??null)&&(candidate.arrivalLocation??null)===(previous.arrivalLocation??null);
 if(time===prior&&!materiallyEqual)return'CONFLICT';
 if(previous.serviceStatus==='ARRIVED'&&candidate.serviceStatus!=='ARRIVED')return'CONFLICT';
 return'ACCEPTED';
}
export function nextPoll(startsAt:string,endsAt:string,delayMinutes:number,failures=0,now=Date.now()):Date{
 const near=Date.parse(startsAt)-now<=2*3600000||Date.parse(endsAt)+delayMinutes*60000-now<=2*3600000;
 return new Date(now+(failures?Math.min(60,5*2**Math.min(failures,4)):near?5:30)*60000);
}
export function monitoringFreshness(lastSuccessAt:string|null|undefined,now=Date.now()):'FRESH'|'STALE'|'UNVERIFIED'{return !lastSuccessAt?'UNVERIFIED':now-Date.parse(lastSuccessAt)<=15*60000?'FRESH':'STALE';}
