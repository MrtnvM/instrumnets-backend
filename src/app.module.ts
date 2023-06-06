import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminModule } from './admin/admin.module';
import { ApiKeyGuard } from './core/guards/api-key.guard';
import { CategoriesModule } from './categories/categories.module';
import { ConsumablesService } from './consumables/consumables.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    AdminModule,
    CategoriesModule,
  ],
  controllers: [AppController],
  providers: [AppService, ApiKeyGuard, ConsumablesService],
})
export class AppModule {}
