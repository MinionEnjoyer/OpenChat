/**
 * DM hooks — open DM channel by userId (FR-SOC-002).
 *
 * POST /dms is idempotent: posting the same userId again returns the
 * existing DM channel without creating a duplicate.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../stores/session';
import type { DmChannelDto } from '../../api/schema';

/** @satisfies FR-SOC-002 */
export function useOpenDm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.request<DmChannelDto>('/dms', {
        method: 'POST',
        body: { userId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dms'] });
    },
  });
}
