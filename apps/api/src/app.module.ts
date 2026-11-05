import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SentryModule } from '@sentry/nestjs/setup';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { validateEnv } from './config/env.validation';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { MovementsModule } from './movements/movements.module';
import { OrganizationModule } from './organization/organization.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { PurchasesModule } from './purchases/purchases.module';
import { SalesHistoryModule } from './sales-history/sales-history.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    MailModule,
    AuthModule,
    UsersModule,
    OrganizationModule,
    CategoriesModule,
    ProductsModule,
    MovementsModule,
    DashboardModule,
    PurchasesModule,
    SalesHistoryModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
