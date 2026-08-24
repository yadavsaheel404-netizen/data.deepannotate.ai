import { supabase } from '@/integrations/supabase/client';

// All mutations route through these two RPCs. Direct INSERTs into
// tokens_transactions are blocked by RLS — addTokens / removeTokens
// are the only sanctioned entry points.

export type TokensTxnType = 'credit' | 'debit';

export type TokensTxnReason =
  | 'profile_complete'
  | 'profile_incomplete_revoke'
  | 'task_reward'
  | 'tip_sent'
  | 'tip_received'
  | 'admin_adjustment';

export interface TokensTransaction {
  id: string;
  user_id: string;
  amount: number; // signed: + for credit, - for debit
  type: TokensTxnType;
  reason: TokensTxnReason;
  reference_type: string | null;
  reference_id: string | null;
  counterparty_user_id: string | null;
  balance_after: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AddTokensArgs {
  userId: string;
  amount: number; // positive
  reason: TokensTxnReason;
  referenceType?: string | null;
  referenceId?: string | null;
  counterpartyUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type RemoveTokensArgs = AddTokensArgs;

/**
 * Credit tokens to a user. Returns the new transaction id, or null if the
 * insert was deduped by the idempotency index.
 */
export async function addTokens(args: AddTokensArgs): Promise<string | null> {
  if (args.amount <= 0) throw new Error('addTokens requires a positive amount');
  const { data, error } = await supabase.rpc('add_tokens', {
    _user_id: args.userId,
    _amount: args.amount,
    _reason: args.reason,
    _reference_type: args.referenceType ?? null,
    _reference_id: args.referenceId ?? null,
    _counterparty_user_id: args.counterpartyUserId ?? null,
    _metadata: (args.metadata ?? null) as any,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/**
 * Debit tokens from a user. Throws "INSUFFICIENT_TOKENS" if the user
 * cannot afford the debit.
 */
export async function removeTokens(args: RemoveTokensArgs): Promise<string> {
  if (args.amount <= 0) throw new Error('removeTokens requires a positive amount');
  const { data, error } = await supabase.rpc('remove_tokens', {
    _user_id: args.userId,
    _amount: args.amount,
    _reason: args.reason,
    _reference_type: args.referenceType ?? null,
    _reference_id: args.referenceId ?? null,
    _counterparty_user_id: args.counterpartyUserId ?? null,
    _metadata: (args.metadata ?? null) as any,
  });
  if (error) {
    if (error.message?.includes('INSUFFICIENT_TOKENS')) {
      throw new Error('INSUFFICIENT_TOKENS');
    }
    throw error;
  }
  return data as string;
}

export interface SendTipArgs {
  /** Recipient's public user ID (e.g. "DF-482193"). */
  recipientPublicId: string;
  amount: number; // positive integer, validated server-side (10..1000)
  note?: string;
  idempotencyKey?: string;
}

export interface SendTipResult {
  debit_id: string;
  credit_id?: string;
  amount: number;
  recipient_id: string;
  replayed?: boolean;
}

/**
 * Send tokens from the current user to another user.
 */
export async function sendTip(args: SendTipArgs): Promise<SendTipResult> {
  const publicId = (args.recipientPublicId ?? '').trim();
  if (!publicId) throw new Error('INVALID_RECIPIENT');
  if (!Number.isInteger(args.amount) || args.amount <= 0) {
    throw new Error('INVALID_AMOUNT');
  }
  const idemKey = args.idempotencyKey ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
  const { data, error } = await (supabase as any).rpc('send_tip_by_public_id', {
    _recipient_public_id: publicId,
    _amount: args.amount,
    _note: args.note ?? null,
    _idempotency_key: idemKey,
  });
  if (error) {
    const msg = error.message || '';
    const code = msg.split(':')[0]?.trim() || msg;
    throw new Error(code);
  }
  return data as unknown as SendTipResult;
}

/** Read the current tokens balance from the transaction ledger. */
export async function getTokensBalance(userId: string): Promise<number> {
  const { data, error } = await (supabase as any).rpc('get_tokens_balance', {
    _user_id: userId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/** Read transaction history for a user, newest first. */
export async function fetchTokensHistory(
  userId: string,
  limit = 50,
): Promise<TokensTransaction[]> {
  const { data, error } = await supabase
    .from('tokens_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as TokensTransaction[];
}
