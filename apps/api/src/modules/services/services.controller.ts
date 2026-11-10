import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiProblems } from '../../infrastructure/http/api-docs';
import { type AuthContext, CurrentAuth, Public } from '../../infrastructure/http/auth-context';
import {
  CreateServiceRequestDto,
  MyServiceListResponseDto,
  MyServiceResponseDto,
  PublicServiceListResponseDto,
  ServiceIdParamsDto,
  UpdateServiceRequestDto,
} from './dto/service.dto';
import { ServicesService } from './services.service';

@ApiTags('services')
@Controller('me/services')
export class MyServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @ZodResponse({ status: 200, type: MyServiceListResponseDto })
  @ApiProblems(401, 403)
  async list(@CurrentAuth() auth: AuthContext): Promise<MyServiceListResponseDto> {
    const items = await this.services.listOwn(auth.userId);
    return { items, total: items.length };
  }

  @Post()
  @ZodResponse({ status: 201, type: MyServiceResponseDto })
  @ApiProblems(400, 401, 403)
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() body: CreateServiceRequestDto,
  ): Promise<MyServiceResponseDto> {
    return this.services.create(auth.userId, body);
  }

  @Patch(':id')
  @ZodResponse({ status: 200, type: MyServiceResponseDto })
  @ApiProblems(400, 401, 403, 404, 422)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param() params: ServiceIdParamsDto,
    @Body() body: UpdateServiceRequestDto,
  ): Promise<MyServiceResponseDto> {
    return this.services.update(auth.userId, params.id, body);
  }

  @Post(':id/archive')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Archived (idempotent). Existing bookings are kept.' })
  @ApiProblems(400, 401, 403, 404)
  async archive(
    @CurrentAuth() auth: AuthContext,
    @Param() params: ServiceIdParamsDto,
  ): Promise<void> {
    await this.services.archive(auth.userId, params.id);
  }
}

@ApiTags('public')
@Public()
@Controller('specialists/:slug/services')
export class PublicServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @ZodResponse({ status: 200, type: PublicServiceListResponseDto })
  @ApiProblems(404)
  async list(@Param('slug') slug: string): Promise<PublicServiceListResponseDto> {
    const items = await this.services.listPublic(slug);
    return { items, total: items.length };
  }
}
