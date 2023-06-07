import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminModule } from './admin/admin.module';
import { ApiKeyGuard } from './core/guards/api-key.guard';
import { CategoriesModule } from './categories/categories.module';
import { ConsumablesService } from './app-services/consumables.service';
import { ProductsService } from './app-services/products.service';
import { ClientCategoryService } from './app-services/client-category.service';

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
  providers: [
    AppService,
    ApiKeyGuard,
    ConsumablesService,
    ProductsService,
    ClientCategoryService,
  ],
})
export class AppModule {}
