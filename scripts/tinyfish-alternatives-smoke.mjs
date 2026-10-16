import {config} from 'dotenv';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
config();const require=createRequire(import.meta.url);const {TripsService}=require('../apps/api/dist/trips.service.js');const {startResearch,inspectResearch}=require('../apps/worker/dist/research.js');
const {prisma:apiDb}=require('../apps/api/node_modules/@tripsaathi/database/dist/index.js');const {prisma}=require('../apps/worker/node_modules/@tripsaathi/database/dist/index.js');
const service=new TripsService();
try{
 if(!process.env.TINYFISH_API_KEY)throw new Error('TinyFish key missing');
 const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10),next=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
 const trip=await service.create({title:'Live TinyFish verification · hotel fallback',destination:'New Delhi',budgetMinor:1500000,currency:'INR',items:[{id:'hotel',category:'HOTEL',label:'New Delhi public hotel search',provider:'Public IHG research',startsAt:day+'T12:00:00.000Z',endsAt:next+'T05:30:00.000Z',timezone:'Asia/Kolkata',details:{property:'Unselected fallback hotel',location:'New Delhi',occupancy:1,bookingStatus:'UNKNOWN'}}],dependencies:[]},'local-demo');
 const task=await service.research(trip.id,'local-demo',{kind:'PUBLIC_ALTERNATIVES',provider:'IHG',itemId:trip.items[0].id});
 await startResearch(task.id);console.log('One TinyFish public hotel dispatch attempt recorded. Trip:',trip.id,'Task:',task.id);
 for(let count=0;count<48;count++){
  await inspectResearch(task.id);const current=await prisma.agentTask.findUnique({where:{id:task.id}});
  if(current.status!=='RUNNING'&&current.status!=='STARTING'){
   const proof={checkedAt:new Date().toISOString(),tripId:trip.id,taskId:task.id,runId:current.runId,status:current.status,result:current.result,error:current.error,expiresAt:current.expiresAt};
   await mkdir('verification',{recursive:true});await writeFile('verification/tinyfish-alternatives-verification.json',JSON.stringify(proof,null,2));
   console.log('Observed application outcome:',current.status,'Result:',current.result?.outcome??'none');break;
  }
  if(count%6===0)console.log('Research still running; awaiting actual evidence.');
  await new Promise(done=>setTimeout(done,5000));
 }
}finally{await Promise.all([apiDb.$disconnect(),prisma.$disconnect()]);}
