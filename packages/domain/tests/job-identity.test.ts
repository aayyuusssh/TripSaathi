import { describe, it, expect } from 'vitest';
import { jobIdentity } from '../../../apps/worker/src/job-identity';
describe('Outbox and reconciliation job identity', () => {
  it('uses the same execution key regardless of which dispatcher discovered the plan', () => {
    expect(jobIdentity('EXECUTE_SANDBOX', { planId: 'plan-1' }, 'outbox-1')).toBe(jobIdentity('EXECUTE_SANDBOX', { planId: 'plan-1' }, 'reconcile-1'));
    expect(jobIdentity('EXECUTE_SANDBOX', { planId: 'plan-2' }, 'outbox-1')).not.toBe(jobIdentity('EXECUTE_SANDBOX', { planId: 'plan-1' }, 'outbox-1'));
  });
  it('deduplicates research and rejects execution without an identity', () => {
    expect(jobIdentity('TINYFISH_POLICY', { taskId: 'task-1' }, 'outbox-1')).toBe('research-task-1');
    expect(jobIdentity('PLAN_EXPLANATION', { taskId: 'task-1' }, 'outbox-1')).toBe('explanation-task-1');
    expect(() => jobIdentity('EXECUTE_SANDBOX', {}, 'outbox-1')).toThrow('plan ID');
  });
});
