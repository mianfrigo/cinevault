import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}
