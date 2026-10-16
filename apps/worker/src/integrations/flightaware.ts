import {matchFlight,flightObservation,type FlightIdentity} from '@tripsaathi/domain';
export class FlightAwareClient{
 constructor(private readonly key:string,private readonly request:typeof fetch=fetch){}
 async status(identity:FlightIdentity){
  if(!this.key)throw new Error('FlightAware key is not configured');
  const number=identity.flightNumber.replace(/\s/g,'').toUpperCase();
  if(!/^[A-Z0-9]{3,12}$/.test(number)||number.startsWith('DEMO'))throw new Error('Enter a real operating flight number');
  const url=new URL('https://aeroapi.flightaware.com/aeroapi/flights/'+encodeURIComponent(identity.providerFlightId??number));
  url.searchParams.set('ident_type',identity.providerFlightId?'fa_flight_id':'designator');url.searchParams.set('max_pages','1');
  if(!identity.providerFlightId){url.searchParams.set('start',new Date(Date.parse(identity.startsAt)-3600000).toISOString());url.searchParams.set('end',new Date(Date.parse(identity.startsAt)+3600000).toISOString());}
  const response=await this.request(url,{headers:{'x-apikey':this.key,Accept:'application/json'},signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw new Error(`FlightAware HTTP ${response.status}`);
  const flight=matchFlight(await response.json(),identity);return flightObservation(flight,identity);
 }
}
