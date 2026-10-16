// Outbox dispatch and recovery scans must address the same logical job.
export function jobIdentity(type: string, payload: Record<string, unknown>, fallbackId: string): string {
  if(type==='TINYFISH_RECONCILE'){if(typeof payload.taskId!=='string'||typeof payload.requestId!=='string')throw new Error('Reconciliation requires task and request IDs');return `reconcile-${payload.taskId}-${payload.requestId}`;}
  if(type==='SERPAPI_FLIGHT_SEARCH'||type==='SERPAPI_HOTEL_SEARCH'){if(typeof payload.taskId!=='string')throw new Error('Search requires a task ID');return 'search-'+payload.taskId;}
  if(type==='DOCUMENT_EXTRACT'){if(typeof payload.importId!=='string'||!payload.importId)throw new Error('Extraction requires an import ID');return`import-${payload.importId}`;}
  if (type === 'EXECUTE_SANDBOX') {
    if (typeof payload.planId !== 'string' || !payload.planId) throw new Error('Execution job requires a plan ID');
    return `execute-${payload.planId}`;
  }
  if (type === 'TINYFISH_POLICY' || type === 'PLAN_EXPLANATION') {
    if (typeof payload.taskId !== 'string' || !payload.taskId) throw new Error('Research job requires a task ID');
    return `${type === 'PLAN_EXPLANATION' ? 'explanation' : 'research'}-${payload.taskId}`;
  }
  return fallbackId;
}


