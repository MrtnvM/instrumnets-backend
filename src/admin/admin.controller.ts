import {
  Controller,
  Post,
  SetMetadata,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PriceParserService } from './price-parser/price-parser.service';
import { ApiKeyGuard } from 'src/core/guards/api-key.guard';

@Controller('admin')
export class AdminController {
  constructor(private readonly priceParserService: PriceParserService) {}

  @Post('update-prices')
  @UseGuards(ApiKeyGuard)
  @SetMetadata('apiKey', '34DXKqh^XDofLnN^Gk9ZaySoXS@xrJ3JEqT')
  @UseInterceptors(FileInterceptor('file'))
  async uploadXlsxFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<any[]> {
    const fileBuffer = file.buffer;
    const parsedProducts = await this.priceParserService.updatePrices(
      fileBuffer,
    );
    return parsedProducts;
  }
}
