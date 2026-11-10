import { z } from 'zod';

/**
 * Every email the system sends, as a typed message (ADR-012). The payload is a snapshot
 * with everything the email needs: notifications never asks other modules for data.
 *
 * Compatibility: messages written by an older release may still be in the queue, so new
 * fields are added as optional; an incompatible change gets a new `type`.
 * Secrets (links with one-time tokens) live only in the `link` field, which is removed
 * from the stored payload once the message is sent or has failed.
 */
const recipient = { to: z.email(), name: z.string().optional() };

export const outboxMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('auth.verify_email'),
    payload: z.object({ ...recipient, link: z.url() }),
  }),
  z.object({
    type: z.literal('auth.password_reset'),
    payload: z.object({ ...recipient, link: z.url() }),
  }),
  z.object({
    // Registration with an email that already has an account (ADR-005: the API response
    // is the same as for a new email, the owner of the address learns what happened)
    type: z.literal('auth.account_exists'),
    payload: z.object({ ...recipient, loginUrl: z.url(), resetUrl: z.url() }),
  }),
]);

export type OutboxMessage = z.infer<typeof outboxMessageSchema>;
export type OutboxMessageType = OutboxMessage['type'];

/** Field removed from the stored payload after delivery (see above). */
export const SECRET_PAYLOAD_FIELD = 'link';
