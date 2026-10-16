import {Injectable,type OnModuleDestroy} from '@nestjs/common';import Redis from 'ioredis';import {workerHealth} from '@tripsaathi/domain';
const index='tripsaathi:runtime:workers';
@Injectable()
export class RuntimeService implements OnModuleDestroy{
 private readonly redis=new Redis(process.env.REDIS_URL??'redis://127.0.0.1:6379',{lazyConnect:true,connectTimeout:1500,commandTimeout:2000,maxRetriesPerRequest:1,retryStrategy:()=>null});private connecting?:Promise<void>;
 constructor(){this.redis.on('error',()=>{});}
 async status(){try{if(this.redis.status!=='ready'){if(!this.connecting)this.connecting=this.redis.connect().finally(()=>{this.connecting=undefined;});await this.connecting;}await this.redis.ping();const ids=await this.redis.zrevrangebyscore(index,Date.now()+5000,Date.now()-120000,'LIMIT',0,8);const values=ids.length?await this.redis.mget(...ids.map(id=>`${index}:${id}`)):[];const workers=values.filter(Boolean).map(raw=>{try{return workerHealth(JSON.parse(raw!));}catch{return workerHealth(null);}});return{redis:'CONNECTED',workers,workerState:workers.some(w=>w.state==='ONLINE')?'ONLINE':workers.some(w=>w.state==='DEGRADED')?'DEGRADED':'UNAVAILABLE',sampleLimit:8};}catch{return{redis:'UNAVAILABLE',workers:[],workerState:'UNKNOWN',sampleLimit:8};}}
 onModuleDestroy(){this.redis.disconnect();}
}
