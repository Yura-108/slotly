import 'server-only';
import { serverApi } from '@/shared/api/server-client';
import type { components, operations } from '@/shared/api/schema';

export type Booking = components['schemas']['Booking_Output'];
export type BookingListQuery = NonNullable<
  operations['MyBookingsController_list']['parameters']['query']
>;

/** A page of the user's bookings (FR-55); the API applies the effective status. */
export async function getMyBookings(
  query: BookingListQuery,
): Promise<{ items: Booking[]; total: number }> {
  const api = await serverApi();
  const { data, response } = await api.GET('/me/bookings', { params: { query } });
  if (!data) throw new Error(`GET /me/bookings failed with ${response.status}`);
  return data;
}
