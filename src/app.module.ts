import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminModule } from './admin/admin.module';
import { ApiKeyGuard } from './core/guards/api-key.guard';
import { CategoriesModule } from './categories/categories.module';
import { TelegramModule } from './telegram/telegram.module';
import { DataModule } from './data/data.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    AdminModule,
    CategoriesModule,
    TelegramModule,
    DataModule,
  ],
  controllers: [AppController],
  providers: [AppService, ApiKeyGuard],
})
export class AppModule {}
