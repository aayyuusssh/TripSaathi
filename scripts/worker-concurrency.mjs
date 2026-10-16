import { config } from 'dotenv';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
config();
const {prisma}=require('../packages/database/dist/index.js');
const {executeSandbox}=require('../apps/worker/dist/execution.js');
const {prisma:workerDb}=require('../apps/worker/node_modules/@tripsaathi/database/dist/index.js');
try{
  const trip=await prisma.trip.create({data:{ownerId:'test-regression',title:'Worker concurrency regression · sandbox',destination:'Test fixture',budgetMinor:500000}});
  const actions=[{key:'pickup',label:'Sandbox pickup',category:'TRANSFER',mode:'SANDBOX',amountMinor:30000,condition:'Regression fixture only.'},{key:'hotel',label:'Sandbox hotel',category:'HOTEL',mode:'SANDBOX',amountMinor:0,condition:'Regression fixture only.'}];
  const plan=await prisma.recoveryPlan.create({data:{tripId:trip.id,revision:1,title:'Concurrent duplicate execution',description:'Sandbox regression fixture; no provider contacted.',status:'APPROVED',digest:'concurrency-fixture',amountMinor:30000,actions,expiresAt:new Date(Date.now()+600000),approval:{create:{digest:'concurrency-fixture',maxAmountMinor:30000,actorId:'test-regression'}}}});
  await Promise.all(Array.from({length:12},()=>executeSandbox(plan.id)));
  await executeSandbox(plan.id);
  const verified=await prisma.recoveryPlan.findUnique({where:{id:plan.id},include:{attempts:true}});
  assert.equal(verified.status,'VERIFIED');assert.equal(verified.attempts.length,2);
  assert.equal(await prisma.tripEvent.count({where:{tripId:trip.id,type:'EXECUTION_UPDATED'}}),1,'Duplicate workers must not publish duplicate confirmations');
  await prisma.trip.update({where:{id:trip.id},data:{revision:2}});
  const stale=await prisma.recoveryPlan.create({data:{tripId:trip.id,revision:1,title:'Superseded execution',description:'Sandbox regression fixture.',status:'APPROVED',digest:'stale-fixture',amountMinor:30000,actions,expiresAt:new Date(Date.now()+600000),approval:{create:{digest:'stale-fixture',maxAmountMinor:30000,actorId:'test-regression'}}}});
  await Promise.all(Array.from({length:4},()=>executeSandbox(stale.id)));
  assert.equal((await prisma.recoveryPlan.findUnique({where:{id:stale.id}})).status,'SUPERSEDED');
  assert.equal(await prisma.actionAttempt.count({where:{planId:stale.id}}),0);
  console.log('PASS: 12 concurrent duplicate executions, repeat delivery, exactly one confirmation event, no duplicate actions, stale plan rejected.');
  console.log('Retained isolated regression fixture:',trip.id);
}catch(error){console.error('Concurrency regression failed:',error.message);process.exitCode=1;}
finally{await prisma.$disconnect();await workerDb.$disconnect();}
