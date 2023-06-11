import { Module } from '@nestjs/common';
import { PriceParserService } from './price-parser/price-parser.service';
import { AdminController } from './admin.controller';
import { DataModule } from 'src/data/data.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [DataModule, ScheduleModule],
  providers: [PriceParserService],
  controllers: [AdminController],
})
export class AdminModule {}
