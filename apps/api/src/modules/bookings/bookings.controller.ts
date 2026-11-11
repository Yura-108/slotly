import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ZodResponse } from 'nestjs-zod';
import { ApiProblems } from '../../infrastructure/http/api-docs';
import { type AuthContext, CurrentAuth } from '../../infrastructure/http/auth-context';
import { BOOKING_RATE_LIMIT } from '../../infrastructure/http/rate-limits';
import { BookingsService } from './bookings.service';
import { BookingResponseDto, CreateBookingRequestDto, toBookingResponse } from './dto/booking.dto';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  /** FR-50: confirmed or pending by the specialist's setting; 409 if the time is taken. */
  @Post()
  @Throttle(BOOKING_RATE_LIMIT)
  @ZodResponse({ status: 201, type: BookingResponseDto })
  @ApiProblems(400, 401, 403, 404, 409, 422, 429)
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() body: CreateBookingRequestDto,
  ): Promise<BookingResponseDto> {
    const booking = await this.bookings.create(auth.userId, {
      serviceId: body.serviceId,
      startAt: new Date(body.startAt),
    });
    return toBookingResponse(booking);
  }
}
