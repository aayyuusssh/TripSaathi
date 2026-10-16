import {config} from 'dotenv';import {createRequire} from 'node:module';import {writeFile,mkdir} from 'node:fs/promises';config();const require=createRequire(import.meta.url);
const {TripsService}=require('../apps/api/dist/trips.service.js');const {WorkflowService}=require('../apps/api/dist/workflow.service.js');const {explainPlan}=require('../apps/worker/dist/explanation.js');const {demoTrip}=require('../packages/domain/dist/index.js');const {prisma}=require('../apps/worker/node_modules/@tripsaathi/database/dist/index.js');
try{
 if(!process.env.GEMINI_API_KEY)throw new Error('Gemini key missing');const service=new TripsService(),workflow=new WorkflowService();
 const input=demoTrip('FLIGHT');input.title='Gemini verification · guidance workflow';const trip=await service.create(input,'local-demo');const plan=(await service.recovery(trip.id,'local-demo'))[0];const task=await workflow.explain(plan.id,'local-demo');
 console.log('One real Gemini explanation attempt reserved. Task:',task.id);await explainPlan(task.id);
 const result=await prisma.agentTask.findUnique({where:{id:task.id}});const proof={checkedAt:new Date().toISOString(),tripId:trip.id,planId:plan.id,taskId:task.id,status:result.status,result:result.result,error:result.error,model:process.env.GEMINI_MODEL??'gemini-3.1-flash-lite'};
 await mkdir('verification',{recursive:true});await writeFile('verification/gemini-explanation-verification.json',JSON.stringify(proof,null,2));console.log('Observed AI explanation outcome:',result.status);
}finally{await prisma.$disconnect();}
