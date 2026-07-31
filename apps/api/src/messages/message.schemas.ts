import { z } from 'zod';

export const MediaUrlSchema = z.string().max(2048).refine((value) => {
  if (value.startsWith('/api/media/')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}, 'Attachment URL must be HTTP(S) or an OpenChat media path');

export const MessageAttachmentSchema = z.object({
  shareAssetId: z.string().min(1).max(128),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  size: z.coerce.bigint().nonnegative(),
  url: MediaUrlSchema,
  thumbnailUrl: MediaUrlSchema.nullable().optional(),
  width: z.number().int().positive().max(100_000).nullable().optional(),
  height: z.number().int().positive().max(100_000).nullable().optional(),
  durationMs: z.number().int().nonnegative().max(604_800_000).nullable().optional(),
});

export const CreateMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  attachments: z.array(MessageAttachmentSchema).max(10).default([]),
  nonce: z.string().min(1).max(128).optional(),
  replyToId: z.string().uuid().nullable().optional(),
});

export const EditMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export type CreateMessageInput = z.input<typeof CreateMessageSchema>;
