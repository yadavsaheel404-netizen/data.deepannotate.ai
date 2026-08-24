import { useQuery } from '@tanstack/react-query';
import { fetchTokensHistory, getTokensBalance } from '@/services/walletService';

export function useTokensBalance(userId?: string | null) {
  return useQuery({
    queryKey: ['tokens-balance', userId],
    queryFn: () => getTokensBalance(userId!),
    enabled: !!userId,
    staleTime: 15_000,
  });
}

export function useTokensHistory(userId?: string | null, limit = 50) {
  return useQuery({
    queryKey: ['tokens-history', userId, limit],
    queryFn: () => fetchTokensHistory(userId!, limit),
    enabled: !!userId,
    staleTime: 15_000,
  });
}
