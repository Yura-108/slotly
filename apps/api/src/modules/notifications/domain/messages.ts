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

/**
 * When the booking is, and the recipient's IANA zone to show it in: a specialist in Berlin
 * and a client in Moscow read the same booking at different hours on their clocks.
 */
const bookingTime = {
  serviceName: z.string(),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  timeZone: z.string(),
  bookingsUrl: z.url(),
};

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
  z.object({
    // FR-60: to the specialist, marked when the booking waits for their answer
    type: z.literal('booking.new_for_specialist'),
    payload: z.object({
      ...recipient,
      ...bookingTime,
      clientName: z.string(),
      needsConfirmation: z.boolean(),
    }),
  }),
  z.object({
    // FR-61: to the client — confirmed right away, or a request waiting for the answer
    type: z.literal('booking.created_for_client'),
    payload: z.object({
      ...recipient,
      ...bookingTime,
      specialistName: z.string(),
      status: z.enum(['pending', 'confirmed']),
    }),
  }),
  z.object({
    // FR-61: a request expired without an answer; the client can choose another time
    type: z.literal('booking.expired'),
    payload: z.object({
      ...recipient,
      ...bookingTime,
      specialistName: z.string(),
      specialistUrl: z.url(),
    }),
  }),
  z.object({
    // FR-61: the specialist confirmed a request
    type: z.literal('booking.confirmed'),
    payload: z.object({ ...recipient, ...bookingTime, specialistName: z.string() }),
  }),
  z.object({
    // FR-61: the specialist rejected a request
    type: z.literal('booking.rejected'),
    payload: z.object({
      ...recipient,
      ...bookingTime,
      specialistName: z.string(),
      reason: z.string().optional(),
    }),
  }),
  z.object({
    // FR-60/61: to the other party — the client cancelled (to the specialist) or the
    // specialist cancelled (to the client)
    type: z.literal('booking.cancelled'),
    payload: z.object({
      ...recipient,
      ...bookingTime,
      cancelledBy: z.enum(['client', 'specialist']),
      /** Who cancelled, as the recipient knows them. */
      byName: z.string(),
      reason: z.string().optional(),
    }),
  }),
]);

export type OutboxMessage = z.infer<typeof outboxMessageSchema>;
export type OutboxMessageType = OutboxMessage['type'];

/** Field removed from the stored payload after delivery (see above). */
export const SECRET_PAYLOAD_FIELD = 'link';
