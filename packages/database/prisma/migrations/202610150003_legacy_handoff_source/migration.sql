-- Old executor handoffs preceded explicit outcome provenance. They were never
-- supplier confirmations, so preserve their meaning in the new report UI.
UPDATE "ActionAttempt" SET "outcomeSource" = 'USER_HANDOFF'
WHERE "status" = 'REQUIRES_USER' AND "outcomeSource" = 'SANDBOX';
