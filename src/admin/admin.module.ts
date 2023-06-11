import { Module } from '@nestjs/common';
import { PriceParserService } from './price-parser/price-parser.service';
import { AdminController } from './admin.controller';
import { DataModule } from 'src/data/data.module';

@Module({
  imports: [DataModule],
  providers: [PriceParserService],
  controllers: [AdminController],
})
export class AdminModule {}
