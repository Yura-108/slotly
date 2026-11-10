import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiProblems } from '../../infrastructure/http/api-docs';
import { type AuthContext, CurrentAuth } from '../../infrastructure/http/auth-context';
import { MeResponseDto } from './dto/me.dto';
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
}
