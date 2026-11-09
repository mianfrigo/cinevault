import { Body, Controller, HttpCode, Inject, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ENV, type Env } from '../config/env';
import type { UserDto } from '../users/user.dto';
import { EmailDto, LoginDto, RegisterDto, TokenDto } from './auth.dto';
import { ACCEPTED, AuthService } from './auth.service';

export const REFRESH_COOKIE = 'cv_refresh';

/** Single place that defines the refresh cookie (Tasks 7+ reuse it on rotation). */
export function setRefreshCookie(
  res: Response,
  raw: string,
  expiresAt: Date,
  env: Pick<Env, 'cookieSecure'>,
): void {
  res.cookie(REFRESH_COOKIE, raw, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/api/v1/auth',
    expires: expiresAt,
  });
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('register')
  @HttpCode(202)
  register(@Body() dto: RegisterDto): Promise<typeof ACCEPTED> {
    return this.auth.register(dto);
  }

  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body() dto: TokenDto): Promise<void> {
    await this.auth.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(202)
  resend(@Body() dto: EmailDto): Promise<typeof ACCEPTED> {
    return this.auth.resendVerification(dto);
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; user: UserDto }> {
    const { accessToken, user, session } = await this.auth.login(dto);
    setRefreshCookie(res, session.raw, session.expiresAt, this.env);
    return { accessToken, user };
  }
}
