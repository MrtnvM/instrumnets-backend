import { Module } from '@nestjs/common';
import { ConsumablesService } from './consumables.service';
import { ProductsService } from './products.service';
import { ClientCategoryService } from './client-category.service';

@Module({
  providers: [ConsumablesService, ProductsService, ClientCategoryService],
  exports: [ConsumablesService, ProductsService, ClientCategoryService],
})
export class DataModule {}
