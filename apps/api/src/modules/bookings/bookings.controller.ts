import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ZodResponse } from 'nestjs-zod';
import { ApiProblems } from '../../infrastructure/http/api-docs';
import { type AuthContext, CurrentAuth } from '../../infrastructure/http/auth-context';
import { BOOKING_RATE_LIMIT } from '../../infrastructure/http/rate-limits';
import { BookingsService } from './bookings.service';
import type { BookingAction } from './domain/booking-status';
import {
  BookingIdParamsDto,
  BookingListQueryDto,
  BookingListResponseDto,
  BookingReasonRequestDto,
  BookingResponseDto,
  CreateBookingRequestDto,
  toBookingResponse,
} from './dto/booking.dto';

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

  @Get(':id')
  @ZodResponse({ status: 200, type: BookingResponseDto })
  @ApiProblems(400, 401, 404)
  async get(
    @CurrentAuth() auth: AuthContext,
    @Param() params: BookingIdParamsDto,
  ): Promise<BookingResponseDto> {
    return toBookingResponse(await this.bookings.get(auth.userId, params.id));
  }

  /** FR-52: pending → confirmed, by the specialist before the request expires. */
  @Post(':id/confirm')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: BookingResponseDto })
  @ApiProblems(400, 401, 403, 404, 409, 422)
  async confirm(
    @CurrentAuth() auth: AuthContext,
    @Param() params: BookingIdParamsDto,
  ): Promise<BookingResponseDto> {
    return this.act(auth, params.id, 'confirm', null);
  }

  /** FR-52: pending → rejected, by the specialist, with an optional reason. */
  @Post(':id/reject')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: BookingResponseDto })
  @ApiProblems(400, 401, 403, 404, 409, 422)
  async reject(
    @CurrentAuth() auth: AuthContext,
    @Param() params: BookingIdParamsDto,
    @Body() body: BookingReasonRequestDto,
  ): Promise<BookingResponseDto> {
    return this.act(auth, params.id, 'reject', body.reason);
  }

  /** FR-53: → cancelled; the client until the deadline, the specialist at any time. */
  @Post(':id/cancel')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: BookingResponseDto })
  @ApiProblems(400, 401, 404, 409, 422)
  async cancel(
    @CurrentAuth() auth: AuthContext,
    @Param() params: BookingIdParamsDto,
    @Body() body: BookingReasonRequestDto,
  ): Promise<BookingResponseDto> {
    return this.act(auth, params.id, 'cancel', body.reason);
  }

  private async act(
    auth: AuthContext,
    id: string,
    action: BookingAction,
    reason: string | null,
  ): Promise<BookingResponseDto> {
    return toBookingResponse(await this.bookings.act(auth.userId, id, action, reason));
  }
}

@ApiTags('bookings')
@Controller('me/bookings')
export class MyBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  /** FR-55: bookings I made (`as=client`) or made to me (`as=specialist`). */
  @Get()
  @ZodResponse({ status: 200, type: BookingListResponseDto })
  @ApiProblems(400, 401)
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: BookingListQueryDto,
  ): Promise<BookingListResponseDto> {
    const { items, total } = await this.bookings.list(auth.userId, {
      party: query.as,
      scope: query.scope,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });
    return { items: items.map(toBookingResponse), total };
  }
}
