import {z} from 'zod';
import type {RecoveryAction} from './index';
import type {Impact,Observation} from './impact';
import type {ItineraryItem} from './itinerary';
import {policyResultSchema} from './index';
import {alternativeResultSchema,validEvidenceUrls} from './research';
export interface ResearchEvidence{id:string;revision:number;kind:string;status:string;url:string;expiresAt:string|null;result:unknown}
export interface GroundedPlan{title:string;description:string;amountMinor:number;actions:RecoveryAction[];planType:'GUIDANCE';costStatus:'UNKNOWN'|'NO_ADDITIONAL_COST';evidence:{id:string;url:string;expiresAt:string;facts:{statement:string;source_url:string;passage:string}[];candidates?:unknown[]}[];unknowns:string[];expiresAt:string}
export function usableEvidence(tasks:ResearchEvidence[],revision:number,now=Date.now()){return tasks.flatMap(task=>{
 if(task.status!=='COMPLETED'||task.revision!==revision||!task.expiresAt||Date.parse(task.expiresAt)<=now)return[];
 const parsed=task.kind==='PUBLIC_ALTERNATIVES'?alternativeResultSchema.safeParse(task.result):policyResultSchema.safeParse(task.result);
 if(!parsed.success||parsed.data.outcome!=='FOUND'||!validEvidenceUrls(task.url,parsed.data))return[];
 return[{id:task.id,url:task.url,expiresAt:task.expiresAt,facts:parsed.data.facts,candidates:task.kind==='PUBLIC_ALTERNATIVES'?alternativeResultSchema.parse(task.result).candidates:[],unknowns:parsed.data.unknowns}];
 });}
export function groundedPlans(items:ItineraryItem[],impacts:Impact[],observations:Observation[],tasks:ResearchEvidence[],revision:number,now=Date.now()):GroundedPlan[]{
 const evidence=usableEvidence(tasks,revision,now);const unknowns=['No provider-verified servicing quote or protected replacement inventory is available.','Refund eligibility, fees and supplier confirmation require verification.'];
 for(const task of evidence)unknowns.push(...task.unknowns);
 const roots:RecoveryAction[]=items.filter(i=>['FLIGHT','RAIL'].includes(i.category)).flatMap(item=>{
  const current=observations.filter(o=>o.itemId===item.id&&(o.itemRevision??1)===(item.revision??1)&&(!o.disposition||o.disposition==='ACCEPTED')).sort((a,b)=>(a.provenance==='LIVE'?1:0)-(b.provenance==='LIVE'?1:0)||Date.parse(a.observedAt)-Date.parse(b.observedAt)).at(-1);
  const actual=current?.serviceStatus==='ARRIVED'&&current.actualArrivalAt&&Date.parse(current.actualArrivalAt)<=now;
  const fresh=current&&now-Date.parse(current.observedAt)<=900000&&Date.parse(current.observedAt)<=now+300000;
  if(actual||fresh&&!['CANCELLED','DIVERTED'].includes(current.serviceStatus??''))return[];
  if(!fresh)unknowns.push(`${item.label}: current transport status is unverified.`);
  return[{key:'transport-'+item.id,itemId:item.id,label:fresh?'Confirm transport recovery with provider':'Verify current transport status',category:item.category,mode:'USER_HANDOFF' as const,amountMinor:0,costKnown:false,condition:'Complete through the authorized airline/rail provider. Confirm the actual destination and arrival before relying on downstream timings.',dependsOn:[],evidenceIds:[]}];
 });
 const affected=[...new Set(impacts.filter(i=>i.state!=='FEASIBLE').map(i=>i.itemId))];
 const actions:RecoveryAction[]=[...roots,...affected.filter(id=>!roots.some(r=>r.itemId===id)).map(id=>{const item=items.find(i=>i.id===id)!;const impact=impacts.filter(i=>i.itemId===id);return{key:'arrangement-'+id,itemId:id,label:item.category==='HOTEL'?'Confirm late arrival or alternate stay':item.category==='TRANSFER'?'Confirm pickup change and fee':'Confirm onward connection and ticket conditions',category:item.category,mode:'USER_HANDOFF' as const,amountMinor:0,costKnown:false,condition:impact.map(i=>`${i.reason} Deadline ${i.deadline}.`).join(' ')+' Supplier acceptance and final cost are not verified.',dependsOn:roots.map(r=>r.key),evidenceIds:evidence.map(e=>e.id)};} )];
 const expiresAt=new Date(Math.min(now+900000,...evidence.map(e=>Date.parse(e.expiresAt)))).toISOString();
 const base:GroundedPlan={title:actions.length?'Coordinate existing arrangements':'Continue checking your arrangements',description:actions.length?'Evidence-linked guidance for user completion. Approval records the steps; it does not authorize a charge or supplier automation.':'No current verified conflict was identified. Unknown conditions still need checking; this is not a guarantee.',amountMinor:0,actions,planType:'GUIDANCE',costStatus:actions.length?'UNKNOWN':'NO_ADDITIONAL_COST',evidence,unknowns:[...new Set(unknowns)],expiresAt};
 const options=evidence.flatMap(e=>e.candidates.map(c=>({e,c}))).slice(0,5);
 if(!options.length)return[base];
 return[base,{...base,title:'Investigate evidenced fallback options',description:'Review public observations on official provider pages before changing any booking. Prices and availability remain unverified.',costStatus:'UNKNOWN',actions:[...roots,...options.map(({e,c},i)=>({key:'option-'+i,category:c.category,mode:'USER_HANDOFF' as const,amountMinor:0,costKnown:false,label:`Review ${c.label}`,condition:`Public observation: ${c.date}. ${c.restrictions} Recheck supplier availability, total price and terms before proceeding. Source: ${c.source_url}`,dependsOn:roots.map(r=>r.key),evidenceIds:[e.id]}))]}];
}
export const actionSchema=z.object({key:z.string().min(1).max(150),label:z.string().min(1),category:z.enum(['FLIGHT','RAIL','HOTEL','TRANSFER']),mode:z.enum(['SANDBOX','USER_HANDOFF']),amountMinor:z.number().int().nonnegative(),condition:z.string(),dependsOn:z.array(z.string()).default([]),itemId:z.string().optional(),evidenceIds:z.array(z.string()).optional(),costKnown:z.boolean().optional()});
export const actionsSchema=z.array(actionSchema).max(60).superRefine((actions,ctx)=>{const ids=new Set(actions.map(a=>a.key));if(ids.size!==actions.length)ctx.addIssue({code:'custom',message:'Duplicate action keys'});const visiting=new Set<string>(),visited=new Set<string>();function visit(key:string):boolean{if(visiting.has(key))return true;if(visited.has(key))return false;visiting.add(key);const a=actions.find(a=>a.key===key);for(const dep of a?.dependsOn??[]){if(!ids.has(dep)){ctx.addIssue({code:'custom',message:'Missing action prerequisite'});continue;}if(visit(dep))return true;}visiting.delete(key);visited.add(key);return false;}if(actions.some(a=>visit(a.key)))ctx.addIssue({code:'custom',message:'Action prerequisites contain a cycle'});});
export const completed=(status:string)=>['VERIFIED','USER_REPORTED_COMPLETED'].includes(status);
export function actionReady(action:RecoveryAction,statuses:Map<string,string>):boolean{return(action.dependsOn??[]).every(key=>completed(statuses.get(key)??''));}
export function executionStatus(statuses:string[],guidance=false):string{
 if(statuses.some(s=>s==='UNKNOWN_OUTCOME'))return'UNKNOWN_OUTCOME';
 if(statuses.length&&statuses.every(completed))return guidance||statuses.includes('USER_REPORTED_COMPLETED')?'USER_REPORTED_COMPLETED':'VERIFIED';
 if(statuses.some(s=>s==='FAILED'))return statuses.some(completed)?'PARTIALLY_COMPLETED':'FAILED';
 return statuses.length?'REQUIRES_USER':guidance?'GUIDANCE_REVIEWED':'VERIFIED';
}
export const explanationSchema=z.object({summary:z.string().min(1).max(3000),actionNotes:z.array(z.object({actionKey:z.string(),note:z.string().max(1200),evidenceIds:z.array(z.string())})).max(60),unknowns:z.array(z.string().max(1200)).max(30)});
export function validateExplanation(value:unknown,actions:RecoveryAction[],evidenceIds:string[]){const parsed=explanationSchema.parse(value);for(const note of parsed.actionNotes){if(!actions.some(a=>a.key===note.actionKey)||note.evidenceIds.some(id=>!evidenceIds.includes(id)))throw new Error('AI explanation references an unknown action/evidence ID');}return parsed;}
