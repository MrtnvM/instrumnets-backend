import { Module } from '@nestjs/common';
import { PriceParserService } from './price-parser/price-parser.service';
import { AdminController } from './admin.controller';

@Module({
  providers: [PriceParserService],
  controllers: [AdminController],
})
export class AdminModule {}
