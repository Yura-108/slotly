import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiNoContentResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ApiProblems } from '../../infrastructure/http/api-docs';
import { Public } from '../../infrastructure/http/auth-context';
import { AUTH_RATE_LIMIT } from '../../infrastructure/http/rate-limits';
import { AuthService } from './auth.service';
import { LoginRequestDto, RegisterRequestDto } from './dto/auth.dto';
import { SessionCookie } from './session-cookie';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookie: SessionCookie,
  ) {}

  @Public()
  @Throttle(AUTH_RATE_LIMIT)
  @Post('register')
  @HttpCode(202)
  @ApiResponse({
    status: 202,
    description: 'Accepted. Identical for a new and an already registered email.',
  })
  @ApiProblems(400, 403, 429)
  async register(@Body() body: RegisterRequestDto): Promise<void> {
    await this.auth.register(body);
  }

  @Public()
  @Throttle(AUTH_RATE_LIMIT)
  @Post('login')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Signed in; the session cookie is set.' })
  @ApiProblems(400, 401, 403, 429)
  async login(
    @Body() body: LoginRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const session = await this.auth.login({
      email: body.email,
      password: body.password,
      userAgent: request.headers['user-agent'],
    });
    this.cookie.set(response, session.token);
  }

  /** Public on purpose: signing out with an expired session must still clear the cookie. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Signed out; the session cookie is cleared.' })
  @ApiProblems(403)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = this.cookie.read(request);
    if (token) await this.auth.logout(token);
    this.cookie.clear(response);
  }
}
