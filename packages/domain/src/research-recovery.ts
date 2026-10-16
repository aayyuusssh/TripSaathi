import {z} from 'zod';import {researchTemplate} from './research';
export const reconciliationSchema=z.object({requestId:z.string(),state:z.enum(['QUEUED','INSPECTING','ATTACHED','NOT_FOUND','AMBIGUOUS','REJECTED','FAILED','INTERRUPTED']),requestedAt:z.string().datetime(),runId:z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/).optional(),message:z.string().max(500).optional()});
export const researchControlSchema=z.object({version:z.literal(1),correlated:z.boolean(),dispatchedAt:z.string().datetime(),pollingSince:z.string().datetime().optional(),attempts:z.number().int().min(0).max(3).default(0),reconciliation:reconciliationSchema.optional()});
export type ResearchControl=z.infer<typeof researchControlSchema>;
export function contextObject(context:unknown):Record<string,unknown>{return context&&typeof context==='object'&&!Array.isArray(context)?context as Record<string,unknown>:{};}
export function researchControl(context:unknown){const parsed=researchControlSchema.safeParse(contextObject(context)._control);return parsed.success?parsed.data:undefined;}
export function researchGoal(id:string,kind:string,url:string,context:unknown){const {_control,...publicContext}=contextObject(context);return `Application correlation: tripsaathi-task-${id}\nOfficial start URL: ${url}\n`+researchTemplate(kind,publicContext);}
export function matchesResearchRun(task:{id:string;kind:string;url:string;context:unknown},run:{run_id?:string;goal?:string;created_at?:string},now=Date.now()){
 const control=researchControl(task.context);if(!control?.correlated||typeof run.run_id!=='string'||!/^[a-zA-Z0-9_-]{1,150}$/.test(run.run_id)||run.goal!==researchGoal(task.id,task.kind,task.url,task.context))return false;
 const created=Date.parse(run.created_at??'');return Number.isFinite(created)&&created>=Date.parse(control.dispatchedAt)-60000&&created<=Date.parse(control.dispatchedAt)+5*60000&&created<=now+5000;
}
export function evidenceExpiry(kind:string,finishedAt:string|undefined,createdAt:Date,now=Date.now()):Date{
 const observed=finishedAt===undefined?createdAt.getTime():Date.parse(finishedAt);if(!Number.isFinite(observed)||observed>now+5000||observed<createdAt.getTime()-60000)throw new Error('Invalid provider completion timestamp');return new Date(Math.min(observed,now)+(kind==='PUBLIC_ALTERNATIVES'?600000:86400000));
}
