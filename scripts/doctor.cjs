// Configuration and connectivity diagnostics. Never prints secret values.
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');const env={};
const text=fs.existsSync(path.join(root,'.env'))?fs.readFileSync(path.join(root,'.env'),'utf8'):'';
for(const line of text.split(/\r?\n/)){const match=line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(match)env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');}
console.log('TripSaathi diagnostics');
console.log('Node:',process.version);
for(const key of ['DATABASE_URL','REDIS_URL','APP_MODE','TINYFISH_API_KEY','FLIGHTAWARE_API_KEY','AIRLABS_API_KEY','SERPAPI_API_KEY','GEMINI_API_KEY','CLERK_SECRET_KEY','NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'])console.log(key+':',env[key]?'configured':'missing');
for(const key of ['DATABASE_URL','REDIS_URL'])if(env[key]){try{new URL(env[key]);}catch{console.log(key+': malformed URL (value hidden)');}}
console.log('Authentication mode:',env.AUTH_MODE||'demo');console.log('Selected flight status provider:',env.FLIGHT_STATUS_PROVIDER||(env.AIRLABS_API_KEY?'AIRLABS':env.FLIGHTAWARE_API_KEY?'FLIGHTAWARE':'AIRLABS'));console.log('FlightAware and Amadeus are optional for the current AirLabs/SerpApi flow.');
console.log('APP_MODE is demo:',env.APP_MODE==='demo');
const ignored=spawnSync('git',['check-ignore','.env'],{cwd:root,encoding:'utf8',timeout:5000});console.log('.env excluded from Git:',ignored.status===0);
const docker=spawnSync('docker',['version','--format','{{.Server.Version}}'],{cwd:root,encoding:'utf8',timeout:8000,windowsHide:true});
if(docker.status===0)console.log('Docker engine: reachable');else console.log('Docker engine: unreachable from this terminal'+(/permission denied/i.test(docker.stderr||'')?' (permission denied)':''));
if(docker.status===0){const ps=spawnSync('docker',['compose','ps','--format','json'],{cwd:root,encoding:'utf8',timeout:8000,windowsHide:true});if(ps.status===0){for(const line of ps.stdout.trim().split(/\r?\n/).filter(Boolean)){try{const container=JSON.parse(line);console.log('Container:',container.Service,'state:',container.State,'health:',container.Health||'unknown');}catch{console.log('Container status output could not be parsed.');}}}}
(async()=>{for(const [name,url] of [['Web','http://127.0.0.1:3000'],['API','http://127.0.0.1:4000/v1/health']]){try{const response=await fetch(url,{signal:AbortSignal.timeout(name==='Web'?15000:5000)});console.log(name+': HTTP',response.status);if(name==='API'&&response.ok){const health=await response.json();console.log('API database:',health.database,'TinyFish configured:',Boolean(health.tinyfishConfigured));console.log('API authentication:',health.authentication||'unknown');}}catch(error){const code=error.cause?.code||error.name;console.log(name+': '+(code==='TimeoutError'?'response timed out (the dev page may still be compiling)':`not reachable (${code})`));}}console.log('Monitoring accepts AirLabs or FlightAware with explicit opt-in. SerpApi flight and hotel search require its key; booking/servicing remain user handoffs. Full local checks: scripts/project.ps1 verify.');})();




