import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ACCEPTED } from '../auth/auth.service';
import { CurrentUser, type AuthUser } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { UserDto } from './user.dto';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  PasswordDto,
  UpdateMeDto,
} from './users.dto';
import { UsersService } from './users.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  get(@CurrentUser() u: AuthUser): Promise<UserDto> {
    return this.users.getMe(u.id);
  }

  @Patch()
  update(
    @CurrentUser() u: AuthUser,
    @Body() dto: UpdateMeDto,
  ): Promise<UserDto> {
    return this.users.updateName(u.id, dto.name);
  }

  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() u: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.users.changePassword(u.id, dto.oldPassword, dto.newPassword);
  }

  @Post('change-email')
  @HttpCode(202)
  changeEmail(
    @CurrentUser() u: AuthUser,
    @Body() dto: ChangeEmailDto,
  ): Promise<typeof ACCEPTED> {
    return this.users.requestEmailChange(u.id, dto.newEmail, dto.password);
  }

  @Delete()
  @HttpCode(204)
  async remove(
    @CurrentUser() u: AuthUser,
    @Body() dto: PasswordDto,
  ): Promise<void> {
    await this.users.deleteAccount(u.id, dto.password);
  }
}
