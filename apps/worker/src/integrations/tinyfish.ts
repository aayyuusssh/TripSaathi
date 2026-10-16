export interface TinyFishRun { status: string; result?: unknown;run_id?:string;goal?:string;created_at?:string;finished_at?:string }
export class TinyFishClient {
  private readonly baseUrl:string;
  constructor(private readonly apiKey:string,baseUrl='https://agent.tinyfish.ai',private readonly request:typeof fetch=fetch){
    const url=new URL(baseUrl);if(url.protocol!=='https:'||url.hostname!=='agent.tinyfish.ai'||url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('TinyFish endpoint must be the official HTTPS Agent API');this.baseUrl=url.origin;
  }
  async start(input:{url:string;goal:string;output_schema:unknown;webhook_url?:string}):Promise<string>{
    if(!this.apiKey)throw new Error('TinyFish key missing');
    const response=await this.request(`${this.baseUrl}/v1/automation/run-async`,{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':this.apiKey},body:JSON.stringify({...input,agent_config:{max_duration_seconds:180}}),signal:AbortSignal.timeout(30000),redirect:'error'});
    if(!response.ok)throw new Error(`TinyFish start returned HTTP ${response.status}`);
    const body=await response.json() as {run_id?:string};if(typeof body.run_id!=='string'||!/^[a-zA-Z0-9_-]{1,150}$/.test(body.run_id))throw new Error('TinyFish returned no valid run ID');return body.run_id;
  }
  async inspect(runId:string):Promise<TinyFishRun>{
    if(!/^[a-zA-Z0-9_-]{1,150}$/.test(runId))throw new Error('Invalid TinyFish run ID');
    const response=await this.request(`${this.baseUrl}/v1/runs/${encodeURIComponent(runId)}`,{headers:{'X-API-Key':this.apiKey},signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!response.ok)throw new Error(`TinyFish status returned HTTP ${response.status}`);return response.json() as Promise<TinyFishRun>;
  }
  async find(goal:string):Promise<TinyFishRun[]>{
    const url=new URL(`${this.baseUrl}/v1/runs`);url.searchParams.set('goal',goal);url.searchParams.set('limit','20');url.searchParams.set('sort_direction','desc');
    const response=await this.request(url,{headers:{'X-API-Key':this.apiKey},signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)throw new Error(`TinyFish run search returned HTTP ${response.status}`);const body=await response.json() as {data?:TinyFishRun[];pagination?:{has_more?:boolean}};if(!Array.isArray(body.data)||body.data.length>20)throw new Error('Invalid TinyFish run search response');if(body.pagination?.has_more)throw new Error('TINYFISH_SEARCH_TRUNCATED');return body.data;
  }
}
