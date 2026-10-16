import type {ItineraryItem,DependencyInput} from './itinerary';
export type ServiceStatus='SCHEDULED'|'DELAYED'|'CANCELLED'|'DIVERTED'|'ARRIVED';
export interface Observation{itemId:string;itemRevision?:number;delayMinutes:number;observedAt:string;provenance:string;source:string;serviceStatus?:ServiceStatus;actualArrivalAt?:string|null;estimatedArrivalAt?:string|null;arrivalLocation?:string|null;providerId?:string|null;providerFlightId?:string|null;disposition?:string}
export type ImpactState='FEASIBLE'|'AT_RISK'|'ACTION_REQUIRED'|'UNKNOWN';
export interface Impact{itemId:string;fromItemId:string;label:string;kind:string;state:ImpactState;expectedAt:string|null;deadline:string;marginMinutes:number|null;reason:string;reasonCode:string;assumptions:string[];protection:string}
type Prediction={eta:number|null;unknown:boolean;blocked:boolean;risk:boolean;reason:string};
export function assessTrip(items:ItineraryItem[],dependencies:DependencyInput[],observations:Observation[],now=Date.now()):Impact[]{
  const latest=new Map<string,Observation>();
  for(const obs of observations){const item=items.find(i=>i.id===obs.itemId);if(!item||(obs.itemRevision??1)!==(item.revision??1)||obs.disposition&&obs.disposition!=='ACCEPTED')continue;const prior=latest.get(obs.itemId);if(!prior||obs.provenance==='LIVE'&&prior.provenance!=='LIVE'||obs.provenance===prior.provenance&&Date.parse(obs.observedAt)>=Date.parse(prior.observedAt))latest.set(obs.itemId,obs);}
  const nodes=new Map<string,Prediction>();
  for(const item of items){const obs=latest.get(item.id);const transport=['FLIGHT','RAIL'].includes(item.category);const terminalArrival=obs?.serviceStatus==='ARRIVED'&&!!obs.actualArrivalAt&&Date.parse(obs.actualArrivalAt)<=now+5*60000;const fresh=!!obs&&(terminalArrival||now-Date.parse(obs.observedAt)<=15*60000)&&Date.parse(obs.observedAt)<=now+5*60000;const status=obs?.serviceStatus??((obs?.delayMinutes??0)>0?'DELAYED':'SCHEDULED');const blocked=fresh&&(status==='CANCELLED'||status==='DIVERTED');
    nodes.set(item.id,{eta:blocked?null:status==='ARRIVED'&&fresh&&obs?.actualArrivalAt?Date.parse(obs.actualArrivalAt):obs?.estimatedArrivalAt?Date.parse(obs.estimatedArrivalAt):Date.parse(item.endsAt)+(obs?.delayMinutes??0)*60000,unknown:transport&&!fresh,blocked,risk:false,reason:blocked?status==='CANCELLED'?'Transport is cancelled.':'Transport was diverted; the original destination/transfer route needs review.':transport&&!fresh?'Current transport status needs a fresh check.':''});
  }
  const indegree=new Map(items.map(i=>[i.id,0]));for(const d of dependencies)indegree.set(d.toItemId,(indegree.get(d.toItemId)??0)+1);
  const queue=items.filter(i=>indegree.get(i.id)===0).map(i=>i.id);const impacts:Impact[]=[];
  for(let cursor=0;cursor<queue.length;cursor++){
    const fromId=queue[cursor];const source=nodes.get(fromId)!;
    for(const dep of dependencies.filter(d=>d.fromItemId===fromId)){
      const target=items.find(i=>i.id===dep.toItemId);if(!target)continue;
      const arrival=source.eta===null?null:source.eta+dep.bufferMinutes*60000;
      const margin=arrival===null?null:Math.floor((Date.parse(dep.deadline)-arrival)/60000);
      const assumptions:string[]=[];if(!dep.bufferSource||dep.bufferSource==='ASSUMED')assumptions.push('Transfer/reporting buffer is an assumption.');if(dep.protection==='THROUGH_BOOKING')assumptions.push('Through-booking relationship is user-reported; provider assistance is not guaranteed.');
      let state:ImpactState;let reason:string;let reasonCode:string;
      if(source.blocked){state='ACTION_REQUIRED';reason=source.reason||'An upstream arrangement is unavailable; this part of the trip needs recovery.';reasonCode='UPSTREAM_BLOCKED';}
      else if(source.unknown||!dep.confirmed){state='UNKNOWN';reason=source.unknown?'An upstream status or connection is unverified.':'Deadline or provider agreement is not confirmed.';reasonCode='UNVERIFIED';}
      else if(margin!==null&&margin<0){state='ACTION_REQUIRED';reason=`Expected arrival is ${Math.abs(margin)} min past this deadline.`;reasonCode='DEADLINE_MISSED';}
      else if(target.category==='RAIL'&&target.details.reservationStatus!=='CONFIRMED'){state='UNKNOWN';reason='Rail reservation is not confirmed; RAC/waitlist is not guaranteed recovery.';reasonCode='RAIL_UNCONFIRMED';}
      else if((margin!==null&&margin<45)||source.risk){state='AT_RISK';reason=source.risk?'An earlier connection is at risk; keep this arrangement under review.':`Only ${margin} min buffer remains. Keep this arrangement under review.`;reasonCode='BUFFER_LOW';}
      else{state='FEASIBLE';reason=`${margin} min buffer remains with the current estimate.`;reasonCode='WITHIN_DEADLINE';}
      impacts.push({itemId:target.id,fromItemId:fromId,label:target.label,kind:dep.kind,state,expectedAt:arrival===null?null:new Date(arrival).toISOString(),deadline:dep.deadline,marginMinutes:margin,reason,reasonCode,assumptions,protection:dep.protection??'UNKNOWN'});
      const prediction=nodes.get(target.id)!;
      if(state==='ACTION_REQUIRED'){prediction.blocked=true;prediction.eta=null;prediction.reason=`${target.label} is affected by an upstream disruption or missed deadline. A replacement/confirmation is needed before downstream timing can be trusted.`;}
      if(state==='UNKNOWN')prediction.unknown=true;if(state==='AT_RISK')prediction.risk=true;
      indegree.set(target.id,(indegree.get(target.id)??1)-1);if(indegree.get(target.id)===0)queue.push(target.id);
    }
  }
  return impacts;
}
