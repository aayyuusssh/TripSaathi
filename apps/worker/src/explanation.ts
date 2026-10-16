import {prisma,Prisma} from '@tripsaathi/database';import {actionsSchema,validateExplanation,type RecoveryAction} from '@tripsaathi/domain';
import {GeminiExplanationClient,type ExplanationProvider,type ExplanationInput} from './integrations/gemini';
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function explainPlan(taskId:string,provider:ExplanationProvider=new GeminiExplanationClient(process.env.GEMINI_API_KEY??'')){
 const task=await prisma.agentTask.findUnique({where:{id:taskId}});if(!task||task.kind!=='PLAN_EXPLANATION'||task.status!=='QUEUED')return;
 const context=task.context as {planId?:string;digest?:string}|null;const plan=context?.planId?await prisma.recoveryPlan.findUnique({where:{id:context.planId},include:{trip:true}}):null;
 if(!plan||plan.tripId!==task.tripId||plan.digest!==context?.digest||plan.revision!==plan.trip.revision||plan.expiresAt.getTime()<=Date.now()||plan.status!=='AWAITING_APPROVAL'){await prisma.agentTask.updateMany({where:{id:taskId,status:'QUEUED'},data:{status:'SUPERSEDED',error:'Plan changed/expired before AI dispatch.'}});if(plan&&plan.tripId===task.tripId&&plan.digest===context?.digest)await prisma.recoveryPlan.update({where:{id:plan.id},data:{explanation:json({status:'SUPERSEDED',taskId,error:'Plan changed/expired before AI dispatch.'})}});return;}
 const claimed=await prisma.agentTask.updateMany({where:{id:taskId,status:'QUEUED'},data:{status:'STARTING'}});if(!claimed.count)return;
 try{
  const actions=actionsSchema.parse(plan.actions) as RecoveryAction[];
  const evidence=Array.isArray(plan.evidence)?plan.evidence as unknown as ExplanationInput['evidence']:[];
  const input:ExplanationInput={actions:actions.map(a=>({...a,itemId:undefined})),costStatus:plan.costStatus,evidence:evidence.map(e=>({id:e.id,facts:e.facts})),unknowns:['Supplier prices, eligibility and acceptance are not guaranteed; consult reviewed plan unknowns.']};
  const result=validateExplanation(await provider.explain(input),actions,evidence.map(e=>e.id));
  await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id"=${task.tripId} FOR UPDATE`;
   const current=await tx.recoveryPlan.findUnique({where:{id:plan.id},include:{trip:true}});const currentTask=await tx.agentTask.findUnique({where:{id:taskId}});if(currentTask?.status!=='STARTING')return;
   const valid=current&&current.digest===plan.digest&&current.revision===current.trip.revision&&current.expiresAt.getTime()>Date.now()&&current.status==='AWAITING_APPROVAL';
   await tx.agentTask.update({where:{id:taskId},data:{status:valid?'COMPLETED':'SUPERSEDED',result:json(result)}});
   if(valid)await tx.recoveryPlan.update({where:{id:plan.id},data:{explanation:json({status:'COMPLETED',taskId,result,provider:'Gemini',advisoryOnly:true})}});
   await tx.tripEvent.create({data:{tripId:task.tripId,type:'PLAN_EXPLANATION',message:valid?'AI explanation saved for review. It cannot change approved actions, prices or provider authority.':'AI explanation retained historically because the plan changed.',provenance:'AI_ADVISORY'}});
  });
 }catch(error){const message=error instanceof Error?error.message:'Explanation failed';await prisma.agentTask.updateMany({where:{id:taskId,status:'STARTING'},data:{status:'FAILED',error:message.slice(0,250)}});await prisma.recoveryPlan.updateMany({where:{id:plan.id,digest:plan.digest},data:{explanation:json({status:'FAILED',taskId,error:message.slice(0,250)})}});}
}
export async function reconcileExplanations(){const tasks=await prisma.agentTask.findMany({where:{kind:'PLAN_EXPLANATION',status:'STARTING',updatedAt:{lt:new Date(Date.now()-60000)}}});for(const task of tasks){await prisma.agentTask.updateMany({where:{id:task.id,status:'STARTING'},data:{status:'UNKNOWN_START',error:'Worker interrupted during AI dispatch. No automatic retry.'}});const context=task.context as {planId?:string}|null;if(context?.planId)await prisma.recoveryPlan.updateMany({where:{id:context.planId},data:{explanation:json({status:'UNKNOWN_OUTCOME',taskId:task.id,error:'AI dispatch outcome is uncertain; no automatic retry.'})}});}}
