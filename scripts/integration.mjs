import assert from 'node:assert/strict';
const root='http://127.0.0.1:4000/v1';
async function request(path,data,expected=200){const response=await fetch(root+'/'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(10000)});const body=await response.json();assert.equal(response.status,expected,JSON.stringify(body));return body;}
let health;
try{health=await request('health');}catch(error){console.error('API is not reachable at '+root+'. Start scripts/project.ps1 dev in another normal PowerShell window, keep it running, then retry. Connection status: '+(error.cause?.code||error.name));process.exit(1);}
assert.equal(health.database,'connected','API is running but database is unavailable. Check Docker containers and DATABASE_URL.');
const trip=await request('demo-trips',{category:'FLIGHT'},201);const itemId=trip.items.find(i=>i.category==='FLIGHT').id;const eventKey=crypto.randomUUID();
await request(`trips/${trip.id}/replay`,{itemId,delayMinutes:180,eventKey,expectedRevision:1},201);
const duplicate=await request(`trips/${trip.id}/replay`,{itemId,delayMinutes:180,eventKey,expectedRevision:1},201);assert.equal(duplicate.revision,2);
await request(`trips/${trip.id}/replay`,{itemId,delayMinutes:60,eventKey:crypto.randomUUID(),expectedRevision:1},409);
const plans=await request(`trips/${trip.id}/recovery`,{},201);assert.ok(plans.length>0);
await request(`plans/${plans[0].id}/approve`,{digest:'wrong',maxAmountMinor:plans[0].amountMinor},409);
await request(`plans/${plans[0].id}/approve`,{digest:plans[0].digest,maxAmountMinor:plans[0].amountMinor},201);
await request(`plans/${plans[0].id}/approve`,{digest:plans[0].digest,maxAmountMinor:plans[0].amountMinor},201);
let latest;
for(let tries=0;tries<20;tries++){latest=await request(`trips/${trip.id}`);if(latest.plans.find(p=>p.id===plans[0].id)?.status==='VERIFIED')break;await new Promise(resolve=>setTimeout(resolve,1000));}
const final=latest.plans.find(p=>p.id===plans[0].id);assert.equal(final.status,'VERIFIED');assert.equal(final.attempts.length,final.actions.length);assert.ok(final.attempts.every(a=>a.reference.startsWith('SANDBOX-')));
assert.equal(latest.events.filter(e=>e.type==='EXECUTION_UPDATED').length,1,'Duplicate queue delivery must not create duplicate confirmation events');
await request(`trips/${trip.id}/replay`,{itemId,delayMinutes:360,eventKey:crypto.randomUUID(),expectedRevision:2},201);
await request(`plans/${plans[0].id}/approve`,{digest:plans[0].digest,maxAmountMinor:plans[0].amountMinor},409);
const rail=await request('demo-trips',{category:'RAIL'},201);assert.equal(rail.items.find(i=>i.category==='RAIL').details.reservationStatus,'CONFIRMED');
console.log('PASS: database, replay idempotency, revision conflicts, exact approvals, queue execution, sandbox verification, superseded approval, rail persistence.');
console.log('Test trips retained as labelled sandbox examples:',trip.id,rail.id);
