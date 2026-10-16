import { z } from 'zod';
export * from './operations';
export * from './status-provider';
export * from './flight-search';
export * from './research-recovery';
import type {Category,TripInput,ItineraryItem} from './itinerary';
import type {Impact} from './impact';
export * from './itinerary';
export * from './impact';
export * from './providers';
export * from './time';
export * from './monitoring';
export * from './research';
export * from './planning';
export * from './imports';
export interface RecoveryAction { key: string; label: string; category: Category; mode: 'SANDBOX' | 'USER_HANDOFF'; amountMinor: number; condition: string;dependsOn?:string[];itemId?:string;evidenceIds?:string[];costKnown?:boolean }
export interface PlanCandidate { title: string; description: string; amountMinor: number; actions: RecoveryAction[] }
export function sandboxPlans(impacts: Impact[], items: ItineraryItem[]): PlanCandidate[] {
  const affected = [...new Map(impacts.filter(i => i.state === 'ACTION_REQUIRED' || i.state === 'AT_RISK').map(i => [i.itemId,i])).values()];
  if (!affected.length) return [{ title: 'Keep your arrangements', description: 'No confirmed timing conflict detected. Continue monitoring; unknown conditions still need verification.', amountMinor: 0, actions: [] }];
  const actions: RecoveryAction[] = affected.map(impact => {
    const item = items.find(i => i.id === impact.itemId)!;
    return { key: item.id, label: item.category === 'HOTEL' ? 'Request and verify late check-in' : item.category === 'TRANSFER' ? 'Reschedule pickup' : 'Review onward connection with provider', category: item.category, mode: item.category === 'RAIL' || item.category === 'FLIGHT' ? 'USER_HANDOFF' : 'SANDBOX', amountMinor: item.category === 'TRANSFER' ? 30000 : 0, condition: 'Illustrative sandbox terms; real provider confirmation required.' };
  });
  return [{ title: 'Preserve your trip', description: 'Coordinate the affected arrangements while keeping your current transport. Amounts below are illustrative sandbox costs.', amountMinor: actions.reduce((n,a) => n+a.amountMinor,0), actions }, { title: 'Prepare an overnight fallback', description: 'Sandbox contingency only: investigate overnight accommodation and a revised pickup. No real inventory is claimed.', amountMinor: 280000, actions: [{ key: 'overnight', label: 'Confirm overnight accommodation', category: 'HOTEL', mode: 'SANDBOX', amountMinor: 250000, condition: 'Simulated room and price; not a live offer.' }, { key: 'pickup-next-day', label: 'Move pickup to next day', category: 'TRANSFER', mode: 'SANDBOX', amountMinor: 30000, condition: 'Simulated provider agreement.' }] }];
}
export function canApprove(plan: { revision: number; digest: string; amountMinor: number; expiresAt: Date }, tripRevision: number, digest: string, maxAmountMinor: number, now = Date.now()): string | null {
  if (plan.revision !== tripRevision) return 'This plan was superseded by a newer trip update.';
  if (plan.expiresAt.getTime() <= now) return 'This plan has expired. Generate a fresh plan.';
  if (plan.digest !== digest) return 'The approved plan does not match the reviewed plan.';
  if (maxAmountMinor < plan.amountMinor) return 'Approved spending limit is below this plan cost.';
  return null;
}
export const policyResultSchema = z.object({ outcome: z.enum(['FOUND', 'NOT_FOUND', 'BLOCKED']), summary: z.string().max(6000), facts: z.array(z.object({ statement: z.string().max(2000), source_url: z.string().url(), passage: z.string().max(2000) })).max(20), unknowns: z.array(z.string()).max(20) });
export const policyOutputSchema = { type: 'object', properties: { outcome: { type:'string', enum:['FOUND','NOT_FOUND','BLOCKED'] }, summary:{type:'string'}, facts:{type:'array',items:{type:'object',properties:{statement:{type:'string'},source_url:{type:'string'},passage:{type:'string'}},required:['statement','source_url','passage']}},unknowns:{type:'array',items:{type:'string'}} }, required:['outcome','summary','facts','unknowns'] };
export function demoTrip(category: 'FLIGHT' | 'RAIL'): TripInput {
  const start = '2026-10-21T08:30:00.000Z'; const arrival = '2026-10-21T12:30:00.000Z';
  const transport: TripInput["items"][number] = {id:'transport',category,label:category==='FLIGHT'?'Delhi → Mumbai':'Delhi → Jaipur',provider:category==='FLIGHT'?'Demo airline':'Demo railway',startsAt:start,endsAt:arrival,timezone:'Asia/Kolkata',details:category==='FLIGHT'?{flightNumber:'DEMO101',departure:'DEL',arrival:'BOM',ticketStatus:'CONFIRMED'}:{trainNumber:'DEMO129',sourceDate:'2026-10-21',boardingDate:'2026-10-21',boardingStation:'NDLS',destinationStation:'JP',reservationStatus:'CONFIRMED',travelClass:'3A',quota:'GENERAL'}};
  return { title: category==='FLIGHT'?'Mumbai arrival, handled':'Jaipur by rail',destination:category==='FLIGHT'?'Mumbai':'Jaipur',budgetMinor:500000,currency:'INR',items:[transport,{id:'pickup',category:'TRANSFER',label:'Arrival pickup',provider:'Sandbox transfers',startsAt:'2026-10-21T13:30:00.000Z',endsAt:'2026-10-21T14:30:00.000Z',timezone:'Asia/Kolkata',details:{pickupLocation:category==='FLIGHT'?'Mumbai airport':'Jaipur station',dropoffLocation:'Destination hotel',capacity:2,bookingStatus:'CONFIRMED'}},{id:'hotel',category:'HOTEL',label:'Destination stay',provider:'Sandbox hotel',startsAt:'2026-10-21T14:30:00.000Z',endsAt:'2026-10-23T05:30:00.000Z',timezone:'Asia/Kolkata',details:{property:'The Arrival House',location:'Destination city',occupancy:2,bookingStatus:'CONFIRMED',lateCheckInConfirmed:true}}],dependencies:[{fromItemId:'transport',toItemId:'pickup',bufferMinutes:45,deadline:'2026-10-21T13:30:00.000Z',confirmed:true,kind:'PICKUP',bufferSource:'USER_CONFIRMED',protection:'UNKNOWN'},{fromItemId:'transport',toItemId:'hotel',bufferMinutes:120,deadline:'2026-10-21T16:30:00.000Z',confirmed:true,kind:'CHECK_IN',bufferSource:'USER_CONFIRMED',protection:'UNKNOWN'}] };
}


export * from './hotel-search';

export * from './hotel-fallback';

export * from './flight-fallback';
