import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppException } from '../common/app.exception';
import { AuthThrottle } from '../common/throttle';
import { ENV, type Env } from '../config/env';
import type { UserDto } from '../users/user.dto';
import {
  EmailDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  TokenDto,
} from './auth.dto';
import { ACCEPTED, AuthService } from './auth.service';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from './cookie';
import { JsonOnlyGuard } from './json-only.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('register')
  @HttpCode(202)
  @AuthThrottle()
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
  @AuthThrottle()
  resend(@Body() dto: EmailDto): Promise<typeof ACCEPTED> {
    return this.auth.resendVerification(dto);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(JsonOnlyGuard)
  @AuthThrottle()
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; user: UserDto }> {
    const { accessToken, user, session } = await this.auth.login(dto);
    setRefreshCookie(res, session.raw, session.expiresAt, this.env);
    return { accessToken, user };
  }
  /**
   * The one cookie-authenticated mutation (TRD 5), so it is CSRF-guarded: when a
   * browser sends an Origin it must be ours. A request with no Origin header
   * (curl, server-side) is allowed: it cannot be a cross-site browser request,
   * and SameSite=Lax already keeps the cookie off cross-site POSTs.
   *
   * It also requires `Content-Type: application/json` (checked first, before
   * anything is consumed): see JsonOnlyGuard.
   */
  @Post('refresh')
  @HttpCode(200)
  @UseGuards(JsonOnlyGuard)
  async refresh(
    @Req() req: Request,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; user: UserDto }> {
    if (origin !== undefined && origin !== this.env.webOrigin) {
      throw new AppException(403, 'FORBIDDEN', 'Origin not allowed');
    }
    try {
      const { accessToken, user, session } = await this.auth.refresh(
        (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE],
      );
      setRefreshCookie(res, session.raw, session.expiresAt, this.env);
      return { accessToken, user };
    } catch (e) {
      // The cookie is useless after a refusal; keep Set-Cookie on the error response.
      if (e instanceof AppException) clearRefreshCookie(res, this.env);
      throw e;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(
      (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE],
    );
    clearRefreshCookie(res, this.env);
  }

  @Post('forgot-password')
  @HttpCode(202)
  @AuthThrottle()
  forgotPassword(@Body() dto: EmailDto): Promise<typeof ACCEPTED> {
    return this.auth.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.newPassword);
  }
}
