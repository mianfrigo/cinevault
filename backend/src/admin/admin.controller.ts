import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import type { UserDto } from '../users/user.dto';
import { UpdateUserDto, UserIdParams, UsersQuery } from './admin.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  async list(@CurrentUser() actor: AuthUser, @Query() q: UsersQuery) {
    await this.admin.requireActiveAdmin(actor.id);
    return this.admin.listUsers(q.q, q.page);
  }

  @Patch('users/:id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param() p: UserIdParams,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDto> {
    return this.admin.updateUser(actor.id, p.id, dto);
  }

  @Delete('users/:id')
  @HttpCode(204)
  async remove(
    @CurrentUser() actor: AuthUser,
    @Param() p: UserIdParams,
  ): Promise<void> {
    await this.admin.deleteUser(actor.id, p.id);
  }

  @Get('overview')
  async overview(@CurrentUser() actor: AuthUser) {
    await this.admin.requireActiveAdmin(actor.id);
    return this.admin.overview();
  }
}
