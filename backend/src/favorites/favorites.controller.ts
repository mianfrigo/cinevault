import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FavoriteParams, FavoritesQuery } from './favorites.dto';
import { FavoritesService } from './favorites.service';

@Controller('me/favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: FavoritesQuery) {
    return this.favorites.list(u.id, q.type, q.page);
  }

  @Get('ids')
  ids(@CurrentUser() u: AuthUser) {
    return this.favorites.ids(u.id);
  }

  @Put(':type/:tmdbId')
  @HttpCode(204)
  async add(
    @CurrentUser() u: AuthUser,
    @Param() p: FavoriteParams,
  ): Promise<void> {
    await this.favorites.add(u.id, p.type, p.tmdbId);
  }

  @Delete(':type/:tmdbId')
  @HttpCode(204)
  async remove(
    @CurrentUser() u: AuthUser,
    @Param() p: FavoriteParams,
  ): Promise<void> {
    await this.favorites.remove(u.id, p.type, p.tmdbId);
  }
}
