import {prisma,Prisma} from '@tripsaathi/database';
import {policyOutputSchema,policyResultSchema,alternativeOutputSchema,alternativeResultSchema,researchTemplate,validEvidenceUrls,researchGoal,researchControl,contextObject,evidenceExpiry} from '@tripsaathi/domain';
import {TinyFishClient} from './integrations/tinyfish';
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const client=()=>new TinyFishClient(process.env.TINYFISH_API_KEY??'',process.env.TINYFISH_BASE_URL);
export async function startResearch(taskId:string,tinyfish:Pick<TinyFishClient,'start'>=client()){
 const task=await prisma.agentTask.findUnique({where:{id:taskId},include:{trip:true}});if(!task||task.status!=='QUEUED'||!['PUBLIC_POLICY','PUBLIC_ALTERNATIVES'].includes(task.kind))return;
 if(task.trip.revision!==task.revision){await prisma.agentTask.updateMany({where:{id:taskId,status:'QUEUED'},data:{status:'SUPERSEDED',error:'Trip changed before dispatch; no external run started.'}});return;}
 const claimed=await prisma.agentTask.updateMany({where:{id:taskId,status:'QUEUED'},data:{status:'STARTING',context:json({...contextObject(task.context),_control:{version:1,correlated:true,dispatchedAt:new Date().toISOString(),attempts:0}})}});if(!claimed.count)return;
 try{
  let webhook_url:string|undefined;const callbackBase=process.env.TINYFISH_CALLBACK_BASE_URL;
  if(callbackBase&&task.callbackToken){const url=new URL(callbackBase);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Callback base must be a clean HTTPS URL');webhook_url=url.toString().replace(/\/$/,'')+`/v1/callbacks/tinyfish/${task.id}/${task.callbackToken}`;}
  const runId=await tinyfish.start({url:task.url,goal:researchGoal(task.id,task.kind,task.url,task.context),output_schema:task.kind==='PUBLIC_ALTERNATIVES'?alternativeOutputSchema:policyOutputSchema,webhook_url});
  await prisma.agentTask.updateMany({where:{id:task.id,status:{in:['STARTING','UNKNOWN_START']},runId:null},data:{runId,status:'RUNNING'}});
 }catch(error){await prisma.agentTask.updateMany({where:{id:task.id,status:'STARTING'},data:{status:'UNKNOWN_START',error:error instanceof Error?error.message:'Dispatch outcome unknown'}});}
}
export async function inspectResearch(taskId:string,tinyfish:Pick<TinyFishClient,'inspect'>=client()){
 const task=await prisma.agentTask.findUnique({where:{id:taskId}});if(!task||task.status!=='RUNNING'||!task.runId)return;
 const body=await tinyfish.inspect(task.runId);if(body.run_id&&body.run_id!==task.runId)throw new Error('TinyFish returned a different run identity');
 if(body.status==='COMPLETED'){
  let expiresAt:Date;try{expiresAt=evidenceExpiry(task.kind,body.finished_at,task.createdAt);}catch{await prisma.agentTask.updateMany({where:{id:task.id,status:'RUNNING'},data:{status:'INVALID_RESULT',error:'Invalid provider completion timestamp; evidence not accepted.'}});return;}
  const result=task.kind==='PUBLIC_ALTERNATIVES'?alternativeResultSchema.safeParse(body.result):policyResultSchema.safeParse(body.result);
  if(!result.success||!validEvidenceUrls(task.url,result.data)){await prisma.agentTask.updateMany({where:{id:task.id,status:'RUNNING'},data:{status:'INVALID_RESULT',error:'Evidence schema or approved HTTPS source validation failed.'}});return;}
  await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id"=${task.tripId} FOR UPDATE`;
   const current=await tx.agentTask.findUnique({where:{id:task.id},include:{trip:true}});if(current?.status!=='RUNNING')return;
   const status=current.trip.revision===task.revision?'COMPLETED':'SUPERSEDED';
   await tx.agentTask.update({where:{id:task.id},data:{status,result:json(result.data),expiresAt}});
   await tx.tripEvent.create({data:{tripId:task.tripId,type:'RESEARCH_COMPLETED',message:status==='SUPERSEDED'?'TinyFish evidence stored historically because the trip changed.':task.kind==='PUBLIC_ALTERNATIVES'?`TinyFish public alternative research: ${result.data.outcome}. Results need availability/price revalidation; no booking was made.`:'TinyFish public policy research completed; ticket-specific eligibility still needs verification.',provenance:'LIVE'}});
  });
 }else if(['FAILED','CANCELLED'].includes(body.status)){await prisma.agentTask.updateMany({where:{id:task.id,status:'RUNNING'},data:{status:body.status,error:'External research did not complete.'}});}
 else if(Date.now()-Date.parse(researchControl(task.context)?.pollingSince??task.createdAt.toISOString())>15*60000)await prisma.agentTask.updateMany({where:{id:task.id,status:'RUNNING'},data:{status:'TIMED_OUT',error:'Local observation window expired; external run may still exist. Do not silently restart.'}});
}
export async function researchTick(){
 await prisma.agentTask.updateMany({where:{kind:{in:['PUBLIC_POLICY','PUBLIC_ALTERNATIVES']},status:'STARTING',updatedAt:{lt:new Date(Date.now()-60000)}},data:{status:'UNKNOWN_START',error:'Worker restarted during dispatch. Do not automatically create a duplicate run.'}});
 const tasks=await prisma.agentTask.findMany({where:{kind:{in:['PUBLIC_POLICY','PUBLIC_ALTERNATIVES']},status:'RUNNING',runId:{not:null}},orderBy:{updatedAt:'desc'},take:10});
 for(const task of tasks)try{await inspectResearch(task.id);}catch{console.warn('Research polling temporarily failed',task.id);}
}

