import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';

export const FederationEventType = z.enum(['MESSAGE_CREATED', 'MESSAGE_UPDATED', 'MESSAGE_DELETED']);

export const FederationEnvelopeSchema = z.object({
  id: z.string().uuid(),
  originNodeId: z.string().regex(/^[a-zA-Z0-9._-]{1,64}$/),
  eventType: FederationEventType,
  aggregateId: z.string().min(1).max(128),
  occurredAt: z.string().datetime(),
  payload: z.record(z.unknown()),
});

export type FederationEnvelope = z.infer<typeof FederationEnvelopeSchema>;
export type FederationPeer = { id: string; url: string };

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

export function signFederationEnvelope(secret: string, timestamp: string, envelope: FederationEnvelope): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${canonicalJson(envelope)}`).digest('hex')}`;
}

export function signaturesMatch(expected: string, supplied: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function parseFederationPeers(value?: string): FederationPeer[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as FederationPeer[];
  return parsed.map((peer) => ({ id: peer.id, url: peer.url.replace(/\/$/, '') }));
}
