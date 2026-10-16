import {prisma,Prisma} from '@tripsaathi/database';
import {canApprove,actionsSchema,actionReady,executionStatus,type RecoveryAction} from '@tripsaathi/domain';
export type SandboxOutcome={status:'VERIFIED'|'FAILED'|'UNKNOWN_OUTCOME';evidence:string};
// A synchronous LOCAL simulation only. Network supplier adapters must use durable
// prepare/dispatch/reconcile stages outside a database transaction.
export function sandboxOutcome(_action:RecoveryAction):SandboxOutcome{return{status:'VERIFIED',evidence:'Confirmed by local sandbox adapter. No supplier contacted; no charge made.'};}
export async function executeSandbox(planId:string,adapter:(action:RecoveryAction)=>SandboxOutcome=sandboxOutcome):Promise<void>{
 for(let attempt=0;attempt<4;attempt++)try{
  await prisma.$transaction(async tx=>{
   const ref=await tx.recoveryPlan.findUnique({where:{id:planId},select:{tripId:true}});if(!ref)return;
   await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id"=${ref.tripId} FOR UPDATE`;
   await tx.$queryRaw`SELECT "id" FROM "RecoveryPlan" WHERE "id"=${planId} FOR UPDATE`;
   const plan=await tx.recoveryPlan.findUnique({where:{id:planId},include:{trip:true,approval:true,attempts:true}});
   if(!plan||!plan.approval||plan.approval.withdrawnAt||plan.status!=='APPROVED')return;
   if(canApprove(plan,plan.trip.revision,plan.approval.digest,plan.approval.maxAmountMinor)||plan.amountMinor>plan.trip.budgetMinor||plan.approval.maxAmountMinor>plan.trip.budgetMinor){await tx.recoveryPlan.update({where:{id:planId},data:{status:'SUPERSEDED'}});return;}
   const parsed=actionsSchema.safeParse(plan.actions);
   if(!parsed.success||plan.planType==='GUIDANCE'&&(parsed.data.some(a=>a.mode!=='USER_HANDOFF')||plan.approval.maxAmountMinor!==0)){await tx.recoveryPlan.update({where:{id:planId},data:{status:'FAILED'}});await tx.tripEvent.create({data:{tripId:plan.tripId,type:'EXECUTION_REJECTED',message:'Action graph or guidance-only authorization failed validation.',provenance:'SYSTEM'}});return;}
   const actions=parsed.data;const statuses=new Map<string,string>();
   for(const action of actions){const row=await tx.actionAttempt.upsert({where:{actionKey:`${planId}-${action.key}`},create:{planId,actionKey:`${planId}-${action.key}`,label:action.label,status:'PENDING',outcomeSource:action.mode==='SANDBOX'?'SANDBOX':'USER_HANDOFF'},update:{}});statuses.set(action.key,row.status==='DEPENDENCY_WAIT'?'PENDING':row.status);}
   for(let pass=0;pass<=actions.length;pass++){let progress=false;
    for(const action of actions){if(statuses.get(action.key)!=='PENDING'||!actionReady(action,statuses))continue;progress=true;
     let status:string,evidence:string,reference:string|null=null;
     if(action.mode==='USER_HANDOFF'){status='REQUIRES_USER';evidence='Complete with the authorized provider, then report the result. This app has not contacted or changed the supplier booking.';}
     else{const outcome=adapter(action);status=outcome.status;evidence=outcome.evidence;if(status==='VERIFIED')reference=`SANDBOX-${planId.slice(-6)}-${action.key.slice(0,8)}`;}
     statuses.set(action.key,status);await tx.actionAttempt.update({where:{actionKey:`${planId}-${action.key}`},data:{status,evidence,reference}});
    }if(!progress)break;
   }
   for(const action of actions)if(statuses.get(action.key)==='PENDING'){statuses.set(action.key,'DEPENDENCY_WAIT');await tx.actionAttempt.update({where:{actionKey:`${planId}-${action.key}`},data:{status:'DEPENDENCY_WAIT',evidence:'Waiting for all prerequisite outcomes. Failed/unknown actions are not automatically retried.'}});}
   const state=executionStatus([...statuses.values()],plan.planType==='GUIDANCE');await tx.recoveryPlan.update({where:{id:planId},data:{status:state}});
   await tx.tripEvent.create({data:{tripId:plan.tripId,type:'EXECUTION_UPDATED',provenance:plan.planType==='GUIDANCE'?'SYSTEM':'SANDBOX',message:plan.planType==='GUIDANCE'?`Guidance workflow: ${state}. No provider transaction or spending authorized.`:`Sandbox workflow: ${state}. No real bookings changed; prerequisite outcomes recorded.`}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:10000});return;
 }catch(error){if(!(error instanceof Prisma.PrismaClientKnownRequestError&&['P2034'].includes(error.code))||attempt===3)throw error;await new Promise(done=>setTimeout(done,50*2**attempt));}
}
