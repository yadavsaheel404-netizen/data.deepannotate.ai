DROP INDEX IF EXISTS public.idx_tokens_txn_idempotent_credit;
CREATE UNIQUE INDEX idx_tokens_txn_idempotent_credit
ON public.tokens_transactions (user_id, reason, reference_id)
WHERE type = 'credit'
  AND reason IN ('task_reward', 'voucher_redeemed');