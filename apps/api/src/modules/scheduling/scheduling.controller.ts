import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiProblems } from '../../infrastructure/http/api-docs';
import { type AuthContext, CurrentAuth } from '../../infrastructure/http/auth-context';
import {
  AddDayOffRequestDto,
  DayOffIdParamsDto,
  DayOffListResponseDto,
  DayOffResponseDto,
  toWeeklyIntervals,
  toWeeklyScheduleResponse,
  WeeklyScheduleRequestDto,
  WeeklyScheduleResponseDto,
} from './dto/scheduling.dto';
import { SchedulingService } from './scheduling.service';

@ApiTags('schedule')
@Controller('me')
export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get('availability')
  @ZodResponse({ status: 200, type: WeeklyScheduleResponseDto })
  @ApiProblems(401, 403)
  async getAvailability(@CurrentAuth() auth: AuthContext): Promise<WeeklyScheduleResponseDto> {
    return toWeeklyScheduleResponse(await this.scheduling.getWeeklySchedule(auth.userId));
  }

  /** PUT: the body is the complete new week; repeating the request gives the same result. */
  @Put('availability')
  @ZodResponse({ status: 200, type: WeeklyScheduleResponseDto })
  @ApiProblems(400, 401, 403, 409)
  async replaceAvailability(
    @CurrentAuth() auth: AuthContext,
    @Body() body: WeeklyScheduleRequestDto,
  ): Promise<WeeklyScheduleResponseDto> {
    const schedule = await this.scheduling.replaceWeeklySchedule(
      auth.userId,
      toWeeklyIntervals(body),
    );
    return toWeeklyScheduleResponse(schedule);
  }

  @Get('days-off')
  @ZodResponse({ status: 200, type: DayOffListResponseDto })
  @ApiProblems(401, 403)
  async listDaysOff(@CurrentAuth() auth: AuthContext): Promise<DayOffListResponseDto> {
    const items = await this.scheduling.listDaysOff(auth.userId);
    return { items, total: items.length };
  }

  @Post('days-off')
  @ZodResponse({ status: 201, type: DayOffResponseDto })
  @ApiProblems(400, 401, 403, 409, 422)
  async addDayOff(
    @CurrentAuth() auth: AuthContext,
    @Body() body: AddDayOffRequestDto,
  ): Promise<DayOffResponseDto> {
    return this.scheduling.addDayOff(auth.userId, body.date);
  }

  @Delete('days-off/:id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Day off removed.' })
  @ApiProblems(400, 401, 403, 404)
  async removeDayOff(
    @CurrentAuth() auth: AuthContext,
    @Param() params: DayOffIdParamsDto,
  ): Promise<void> {
    await this.scheduling.removeDayOff(auth.userId, params.id);
  }
}
