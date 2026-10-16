import Redis from 'ioredis';import {randomUUID} from 'node:crypto';import type {Heartbeat} from '@tripsaathi/domain';
export const HEARTBEAT_INDEX='tripsaathi:runtime:workers';
export class WorkerHeartbeat{
 private readonly redis:Redis;private readonly id=randomUUID();private readonly startedAt=Date.now();private busy=false;private timer?:ReturnType<typeof setInterval>;
 private dispatch:Heartbeat['dispatch']={lastSuccess:null,failed:false};private monitoring:Heartbeat['monitoring']={lastSuccess:null,failed:false};
 constructor(url=process.env.REDIS_URL??'redis://127.0.0.1:6379'){this.redis=new Redis(url,{lazyConnect:true,connectTimeout:1500,commandTimeout:2000,maxRetriesPerRequest:1,retryStrategy:()=>null});this.redis.on('error',()=>{});}
 complete(loop:'dispatch'|'monitoring',ok:boolean){this[loop]={lastSuccess:ok?Date.now():this[loop].lastSuccess,failed:!ok};}
 async publish(){if(this.busy)return;this.busy=true;try{if(this.redis.status==='wait'||this.redis.status==='end')await this.redis.connect();const at=Date.now();await this.redis.multi().set(`${HEARTBEAT_INDEX}:${this.id}`,JSON.stringify({at,startedAt:this.startedAt,dispatch:this.dispatch,monitoring:this.monitoring}),'EX',35).zadd(HEARTBEAT_INDEX,at,this.id).zremrangebyscore(HEARTBEAT_INDEX,'-inf',at-120000).exec();}catch{/* Redis/worker availability is reported by the API; never leak connection details. */}finally{this.busy=false;}}
 start(){this.timer=setInterval(()=>void this.publish(),10000);void this.publish();}
 async stop(){if(this.timer)clearInterval(this.timer);try{if(this.redis.status==='ready')await this.redis.multi().del(`${HEARTBEAT_INDEX}:${this.id}`).zrem(HEARTBEAT_INDEX,this.id).exec();}finally{this.redis.disconnect();}}
}
