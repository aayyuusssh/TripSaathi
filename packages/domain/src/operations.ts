import {z} from 'zod';
const timestamp=z.number().int().min(0).max(8640000000000000);
export const heartbeatSchema=z.object({at:timestamp,startedAt:timestamp,dispatch:z.object({lastSuccess:timestamp.nullable(),failed:z.boolean()}),monitoring:z.object({lastSuccess:timestamp.nullable(),failed:z.boolean()})});
export type Heartbeat=z.infer<typeof heartbeatSchema>;
export function workerHealth(raw:unknown,now=Date.now()){
 const parsed=heartbeatSchema.safeParse(raw);if(!parsed.success)return{state:'UNKNOWN' as const,lastSeen:null};const value=parsed.data;if(value.at>now+5000||now-value.at>30000)return{state:'STALE' as const,lastSeen:new Date(value.at).toISOString()};
 const stalled=[value.dispatch,value.monitoring].some(loop=>loop.failed||now-(loop.lastSuccess??value.startedAt)>90000);
 return{state:stalled?'DEGRADED' as const:'ONLINE' as const,lastSeen:new Date(value.at).toISOString()};
}
export const failureGuidance=(status:string)=>['UNKNOWN_START','UNKNOWN_OUTCOME','STARTING','TIMED_OUT'].includes(status)?'Inspect the provider record before any new request. An uncertain operation must not be automatically repeated.':status==='BLOCKED'?'The source blocked access. Review the official site manually.':'Review the activity and provider configuration. A new request may consume quota; no automatic paid retry is offered.';

