import {describe,it,expect} from 'vitest';
import {hotelSearchQuerySchema,parseHotelSearch} from '../src/hotel-search';
const q={location:'Mumbai airport hotels',checkIn:'2026-10-17',checkOut:'2026-10-19',adults:2,currency:'INR' as const};
const fixture=()=>({search_metadata:{created_at:new Date().toISOString(),secret_url:'PRIVATE'},search_parameters:{engine:'google_hotels',q:q.location,check_in_date:q.checkIn,check_out_date:q.checkOut,currency:'INR',adults:2,children:0},properties:[{type:'hotel',name:'Synthetic hotel',rate_per_night:{extracted_lowest:2000},link:'https://secret.invalid/?api_key=PRIVATE',check_in_time:'3 PM'}]});
describe('hotel fallback observations',()=>{
 it('validates calendar dates and bounded stays',()=>{expect(hotelSearchQuerySchema.safeParse({...q,checkIn:'2026-02-30'}).success).toBe(false);expect(hotelSearchQuerySchema.safeParse({...q,checkOut:q.checkIn}).success).toBe(false);expect(hotelSearchQuerySchema.safeParse({...q,checkOut:'2026-12-19'}).success).toBe(false);});
 it('never invents a total from nightly rates or retains provider URLs',()=>{const r=parseHotelSearch(fixture(),q);expect(r.options[0].nightlyMinor).toBe(200000);expect(r.options[0].stayTotalMinor).toBeNull();expect(JSON.stringify(r)).not.toContain('PRIVATE');expect(r.unknowns.join()).toContain('late arrival');});
 it('rejects wrong dates, occupancy, currency and old observations',()=>{for(const change of [{check_in_date:'2026-10-18'},{adults:1},{children:1},{currency:'USD'}]){const f=fixture();Object.assign(f.search_parameters,change);expect(()=>parseHotelSearch(f,q)).toThrow();}const f=fixture();f.search_metadata.created_at=new Date(Date.now()-7200000).toISOString();expect(()=>parseHotelSearch(f,q)).toThrow();});
 it('does not mistake vacation rentals or missing prices for hotel availability',()=>{const f=fixture();f.properties[0].type='vacation rental';expect(parseHotelSearch(f,q).outcome).toBe('NOT_FOUND');});
});
