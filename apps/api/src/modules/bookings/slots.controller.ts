import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiProblems } from '../../infrastructure/http/api-docs';
import { Public } from '../../infrastructure/http/auth-context';
import { SlotListResponseDto, SlotsParamsDto, SlotsQueryDto } from './dto/slots.dto';
import { SlotsService } from './slots.service';

@ApiTags('public')
@Public()
@Controller('specialists')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  /** Free slots of an active service, in UTC (FR-40–43). */
  @Get(':slug/slots')
  @ZodResponse({ status: 200, type: SlotListResponseDto })
  @ApiProblems(400, 404)
  async list(
    @Param() params: SlotsParamsDto,
    @Query() query: SlotsQueryDto,
  ): Promise<SlotListResponseDto> {
    const slots = await this.slots.findFree(params.slug, query.serviceId, {
      start: new Date(query.from),
      end: new Date(query.to),
    });
    const items = slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() }));
    return { items, total: items.length };
  }
}
