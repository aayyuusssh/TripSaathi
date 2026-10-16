import {Injectable,NotFoundException,ConflictException,BadRequestException,ServiceUnavailableException} from '@nestjs/common';
import {prisma} from '@tripsaathi/database';
import {actionsSchema,actionReady,executionStatus,canApprove} from '@tripsaathi/domain';
import {z} from 'zod';import {createHash} from 'node:crypto';
import {serial,parsed,json} from './trips.service';
const withdrawSchema=z.object({digest:z.string(),reason:z.string().min(2).max(500)});
const reportSchema=z.object({resultKey:z.string().min(8).max(100),status:z.enum(['USER_REPORTED_COMPLETED','FAILED','UNKNOWN_OUTCOME']),reference:z.string().min(2).max(150).optional(),evidence:z.string().min(5).max(2000),reconciled:z.boolean().default(false)});
@Injectable()
export class WorkflowService{
 async withdraw(planId:string,ownerId:string,body:unknown){const input=parsed(withdrawSchema,body);return serial(async tx=>{
  const ref=await tx.recoveryPlan.findUnique({where:{id:planId},select:{tripId:true}});if(!ref)throw new NotFoundException('Plan not found');await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id"=${ref.tripId} AND "ownerId"=${ownerId} FOR UPDATE`;
  const plan=await tx.recoveryPlan.findUnique({where:{id:planId},include:{trip:true,approval:true,attempts:true}});if(!plan||plan.trip.ownerId!==ownerId)throw new NotFoundException('Plan not found');if(plan.digest!==input.digest)throw new ConflictException('Plan digest differs');if(plan.status==='WITHDRAWN')return{withdrawn:true,alreadyWithdrawn:true};
  if(['VERIFIED','USER_REPORTED_COMPLETED','GUIDANCE_REVIEWED'].includes(plan.status))throw new ConflictException('This workflow already completed. Withdrawal cannot undo completed provider actions.');
  if(plan.approval)await tx.approval.update({where:{id:plan.approval.id},data:{withdrawnAt:new Date(),withdrawalReason:input.reason}});
  await tx.recoveryPlan.update({where:{id:planId},data:{status:'WITHDRAWN'}});await tx.actionAttempt.updateMany({where:{planId,status:{in:['PENDING','DEPENDENCY_WAIT','REQUIRES_USER']}},data:{status:'WITHDRAWN',evidence:'Permission withdrawn for remaining steps. Previous completed/unknown outcomes are preserved.'}});
  await tx.tripEvent.create({data:{tripId:plan.tripId,type:'APPROVAL_WITHDRAWN',message:'Remaining workflow permission withdrawn. Completed actions and unknown outcomes remain in history; no booking is automatically reversed.',provenance:'USER_REPORTED'}});return{withdrawn:true};
 });}
 async report(planId:string,attemptId:string,ownerId:string,body:unknown){const input=parsed(reportSchema,body);return serial(async tx=>{
  const ref=await tx.recoveryPlan.findUnique({where:{id:planId},select:{tripId:true}});if(!ref)throw new NotFoundException('Plan not found');await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id"=${ref.tripId} AND "ownerId"=${ownerId} FOR UPDATE`;
  const plan=await tx.recoveryPlan.findUnique({where:{id:planId},include:{trip:true,approval:true,attempts:true}});if(!plan||plan.trip.ownerId!==ownerId)throw new NotFoundException('Plan not found');const attempt=plan.attempts.find(a=>a.id===attemptId);if(!attempt)throw new NotFoundException('Action not found');
  const actions=parsed(actionsSchema,plan.actions);const action=actions.find(a=>`${planId}-${a.key}`===attempt.actionKey);if(action?.mode!=='USER_HANDOFF')throw new BadRequestException('User reports are only accepted for supplier handoff actions');
  const signature=createHash('sha256').update(JSON.stringify(input)).digest('hex');const prior=await tx.tripMutation.findUnique({where:{tripId_requestKey:{tripId:plan.tripId,requestKey:input.resultKey}}});
  if(prior){if(prior.fingerprint!==`${attemptId}:${signature}`)throw new ConflictException('Result key reused for different data');return{alreadyReported:true};}
  if(!['REQUIRES_USER','UNKNOWN_OUTCOME'].includes(attempt.status)||plan.status==='WITHDRAWN'&&attempt.status!=='UNKNOWN_OUTCOME')throw new ConflictException('This action is not open for a new report');
  if(attempt.status==='UNKNOWN_OUTCOME'&&!input.reconciled)throw new ConflictException('Inspect the provider record first; then explicitly report reconciliation. No automatic retry is permitted.');
  if(input.status==='USER_REPORTED_COMPLETED'&&!input.reference)throw new BadRequestException('Completed handoff requires a provider reference');
  await tx.actionAttempt.update({where:{id:attempt.id},data:{status:input.status,reference:input.reference??null,evidence:input.evidence,outcomeSource:'USER_REPORTED',resultKey:input.resultKey,reportedAt:new Date()}});
  const statuses=new Map(actions.map(a=>[a.key,`${planId}-${a.key}`===attempt.actionKey?input.status:plan.attempts.find(r=>r.actionKey===`${planId}-${a.key}`)?.status??'PENDING']));
  const valid=plan.approval&&!plan.approval.withdrawnAt&&!canApprove(plan,plan.trip.revision,plan.approval.digest,plan.approval.maxAmountMinor);
  let pendingSandbox=false;
  if(valid&&input.status!=='UNKNOWN_OUTCOME')for(const action of actions){const status=statuses.get(action.key);if(['DEPENDENCY_WAIT','PENDING'].includes(status??'')&&actionReady(action,statuses)){const next=action.mode==='USER_HANDOFF'?'REQUIRES_USER':'PENDING';statuses.set(action.key,next);await tx.actionAttempt.update({where:{actionKey:`${planId}-${action.key}`},data:{status:next,evidence:next==='REQUIRES_USER'?'Prerequisites were reported complete. Provider confirmation and final cost still require user verification.':'Sandbox prerequisite satisfied.'}});if(next==='PENDING')pendingSandbox=true;}}
  const state=valid?pendingSandbox?'APPROVED':executionStatus([...statuses.values()],plan.planType==='GUIDANCE'):plan.status==='WITHDRAWN'?'WITHDRAWN':'SUPERSEDED';
  await tx.recoveryPlan.update({where:{id:plan.id},data:{status:state}});if(pendingSandbox)await tx.outbox.create({data:{type:'EXECUTE_SANDBOX',payload:{planId}}});
  await tx.tripMutation.create({data:{tripId:plan.tripId,requestKey:input.resultKey,fingerprint:`${attemptId}:${signature}`,revision:plan.trip.revision}});
  await tx.tripEvent.create({data:{tripId:plan.tripId,type:input.reconciled?'ACTION_RECONCILED':'ACTION_REPORTED',message:`User reported supplier action: ${input.status}. This is not independent provider verification; update the itinerary after confirmed booking changes.`,provenance:'USER_REPORTED'}});return{status:state,userReported:true};
 });}
 async explain(planId:string,ownerId:string){if(!process.env.GEMINI_API_KEY)throw new ServiceUnavailableException('Gemini key not configured');return serial(async tx=>{
  const ref=await tx.recoveryPlan.findUnique({where:{id:planId},select:{tripId:true}});if(!ref)throw new NotFoundException('Plan not found');await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id"=${ref.tripId} AND "ownerId"=${ownerId} FOR UPDATE`;
  const plan=await tx.recoveryPlan.findUnique({where:{id:planId},include:{trip:true}});if(!plan||plan.trip.ownerId!==ownerId)throw new NotFoundException('Plan not found');if(plan.revision!==plan.trip.revision||plan.expiresAt.getTime()<=Date.now()||plan.status!=='AWAITING_APPROVAL')throw new ConflictException('Request an explanation for a current unexpired plan awaiting review');
  const existing=await tx.agentTask.findFirst({where:{tripId:plan.tripId,kind:'PLAN_EXPLANATION',context:{path:['planId'],equals:planId}}});if(existing)return{id:existing.id,status:existing.status};
  const cap=Math.max(1,Math.min(5,Number(process.env.GEMINI_TRIP_DAILY_CALL_LIMIT)||2));if(await tx.agentTask.count({where:{tripId:plan.tripId,kind:'PLAN_EXPLANATION',createdAt:{gte:new Date(Date.now()-86400000)}}})>=cap)throw new ConflictException('AI explanation trip cap reached');
  const task=await tx.agentTask.create({data:{tripId:plan.tripId,revision:plan.revision,kind:'PLAN_EXPLANATION',url:'https://generativelanguage.googleapis.com/',context:json({planId,digest:plan.digest})}});
  await tx.recoveryPlan.update({where:{id:planId},data:{explanation:json({status:'QUEUED',taskId:task.id})}});await tx.outbox.create({data:{type:'PLAN_EXPLANATION',payload:{taskId:task.id}}});return{id:task.id,status:'QUEUED'};
 });}
}
