import { api, unwrap } from '@/api/client';
import type { ShareTokenDetails } from '@/api/types';

export const tokensApi = {
  get: (tokenId: string) => unwrap(api.get<ShareTokenDetails>(`/share-tokens/${tokenId}`)),
  revoke: (tokenId: string) => unwrap(api.post<{ ok: boolean }>(`/share-tokens/${tokenId}/revoke`)),
};
