import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AppCacheModule } from './cache/app-cache.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { FavoritesModule } from './favorites/favorites.module';
import { ConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AppCacheModule,
    CatalogModule,
    MailModule,
    AuthModule,
    UsersModule,
    FavoritesModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
