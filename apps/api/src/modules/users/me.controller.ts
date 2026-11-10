import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiProblems } from '../../infrastructure/http/api-docs';
import { type AuthContext, CurrentAuth } from '../../infrastructure/http/auth-context';
import { MeResponseDto, UpdateMeRequestDto } from './dto/me.dto';
import { UsersService } from './users.service';

/** Resources of the current user live under /me: the owner comes from the session, never from the URL. */
@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ZodResponse({ status: 200, type: MeResponseDto, description: 'Current user' })
  @ApiProblems(401)
  async getMe(@CurrentAuth() auth: AuthContext): Promise<MeResponseDto> {
    return this.users.getProfile(auth.userId);
  }

  /** FR-5: name and time zone. Email and password have their own flows. */
  @Patch()
  @ZodResponse({ status: 200, type: MeResponseDto, description: 'Updated profile' })
  @ApiProblems(400, 401, 403)
  async updateMe(
    @CurrentAuth() auth: AuthContext,
    @Body() body: UpdateMeRequestDto,
  ): Promise<MeResponseDto> {
    return this.users.updateProfile(auth.userId, body);
  }
}
