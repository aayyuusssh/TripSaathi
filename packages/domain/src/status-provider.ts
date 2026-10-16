export type FlightStatusProvider='AIRLABS'|'FLIGHTAWARE';
export function flightStatusSettings(env:Record<string,string|undefined>,provider?:string){
 const id=provider??env.FLIGHT_STATUS_PROVIDER??(env.AIRLABS_API_KEY?'AIRLABS':env.FLIGHTAWARE_API_KEY?'FLIGHTAWARE':'AIRLABS');if(id!=='AIRLABS'&&id!=='FLIGHTAWARE')throw new Error('Unknown flight status provider');
 const bounded=(value:string|undefined,fallback:number,max:number)=>Math.max(1,Math.min(max,Number(value)||fallback));
 return{providerId:id as FlightStatusProvider,name:id==='AIRLABS'?'AirLabs':'FlightAware',configured:!!env[id==='AIRLABS'?'AIRLABS_API_KEY':'FLIGHTAWARE_API_KEY'],dailyLimit:bounded(env[id+'_DAILY_CALL_LIMIT'],id==='AIRLABS'?10:200,1000),monthlyLimit:id==='AIRLABS'?bounded(env.AIRLABS_MONTHLY_CALL_LIMIT,50,100000):null,leadHours:id==='AIRLABS'?10:24};
}
