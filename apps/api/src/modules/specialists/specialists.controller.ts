import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiProblems } from '../../infrastructure/http/api-docs';
import { type AuthContext, CurrentAuth, Public } from '../../infrastructure/http/auth-context';
import { SpecialistNotFoundError } from './domain/errors';
import {
  EnableSpecialistRequestDto,
  PublicSpecialistResponseDto,
  SlugParamsDto,
  SpecialistProfileResponseDto,
  UpdateSpecialistRequestDto,
} from './dto/specialist.dto';
import { SpecialistsService } from './specialists.service';

@ApiTags('specialist profile')
@Controller('me/specialist-profile')
export class MySpecialistProfileController {
  constructor(private readonly specialists: SpecialistsService) {}

  /** 404 when not enabled yet: the web app then offers to enable it. */
  @Get()
  @ZodResponse({ status: 200, type: SpecialistProfileResponseDto })
  @ApiProblems(401, 404)
  async get(@CurrentAuth() auth: AuthContext): Promise<SpecialistProfileResponseDto> {
    const profile = await this.specialists.findOwn(auth.userId);
    if (!profile) throw new SpecialistNotFoundError();
    return profile;
  }

  @Post()
  @ZodResponse({ status: 201, type: SpecialistProfileResponseDto })
  @ApiProblems(400, 401, 403, 409)
  async enable(
    @CurrentAuth() auth: AuthContext,
    @Body() body: EnableSpecialistRequestDto,
  ): Promise<SpecialistProfileResponseDto> {
    return this.specialists.enable(auth.userId, body);
  }

  @Patch()
  @ZodResponse({ status: 200, type: SpecialistProfileResponseDto })
  @ApiProblems(400, 401, 403, 409)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Body() body: UpdateSpecialistRequestDto,
  ): Promise<SpecialistProfileResponseDto> {
    return this.specialists.update(auth.userId, body);
  }
}

@ApiTags('public')
@Public()
@Controller('specialists')
export class PublicSpecialistsController {
  constructor(private readonly specialists: SpecialistsService) {}

  @Get(':slug')
  @ZodResponse({ status: 200, type: PublicSpecialistResponseDto })
  @ApiProblems(404)
  async getBySlug(@Param() params: SlugParamsDto): Promise<PublicSpecialistResponseDto> {
    return this.specialists.getBySlug(params.slug);
  }
}
