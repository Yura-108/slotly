import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiNoContentResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ApiProblems } from '../../infrastructure/http/api-docs';
import { type AuthContext, CurrentAuth, Public } from '../../infrastructure/http/auth-context';
import { AUTH_RATE_LIMIT } from '../../infrastructure/http/rate-limits';
import { AuthService } from './auth.service';
import {
  LoginRequestDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RegisterRequestDto,
  VerifyEmailRequestDto,
} from './dto/auth.dto';
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
    description:
      'Accepted. Identical for a new and an already registered email; the address owner gets an email either way.',
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

  /** Public: the link may be opened in another browser than the one used to sign up. */
  @Public()
  @Throttle(AUTH_RATE_LIMIT)
  @Post('verify-email')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Email confirmed.' })
  @ApiProblems(400, 403, 422, 429)
  async verifyEmail(@Body() body: VerifyEmailRequestDto): Promise<void> {
    await this.auth.verifyEmail(body.token);
  }

  @Throttle(AUTH_RATE_LIMIT)
  @Post('verify-email/resend')
  @HttpCode(204)
  @ApiNoContentResponse({
    description: 'A new link is sent unless the email is already confirmed.',
  })
  @ApiProblems(401, 403, 429)
  async resendVerification(@CurrentAuth() auth: AuthContext): Promise<void> {
    await this.auth.resendVerification(auth.userId);
  }

  @Public()
  @Throttle(AUTH_RATE_LIMIT)
  @Post('password-reset/request')
  @HttpCode(202)
  @ApiResponse({ status: 202, description: 'Accepted. Identical whether the email exists or not.' })
  @ApiProblems(400, 403, 429)
  async requestPasswordReset(@Body() body: PasswordResetRequestDto): Promise<void> {
    await this.auth.requestPasswordReset(body.email);
  }

  @Public()
  @Throttle(AUTH_RATE_LIMIT)
  @Post('password-reset/confirm')
  @HttpCode(204)
  @ApiNoContentResponse({
    description: 'Password changed; every session of the user is revoked and the cookie cleared.',
  })
  @ApiProblems(400, 403, 422, 429)
  async resetPassword(
    @Body() body: PasswordResetConfirmDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.resetPassword(body.token, body.password);
    this.cookie.clear(response);
  }
}
