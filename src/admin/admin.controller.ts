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
import * as XLSX from 'xlsx';

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

  @Post('old/update-prices')
  @UseGuards(ApiKeyGuard)
  @SetMetadata('apiKey', '34DXKqh^XDofLnN^Gk9ZaySoXS@xrJ3JEqT')
  @UseInterceptors(FileInterceptor('file'))
  async uploadXlsxFile2(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<any[]> {
    const fileBuffer = file.buffer;
    const parsedProducts = await this.priceParserService.updatePrices2(
      fileBuffer,
    );
    return parsedProducts;
  }

  @Post('playground')
  @UseGuards(ApiKeyGuard)
  @SetMetadata('apiKey', '34DXKqh^XDofLnN^Gk9ZaySoXS@xrJ3JEqT')
  @UseInterceptors(FileInterceptor('file'))
  async playground(@UploadedFile() file: Express.Multer.File) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const worksheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[worksheetName];

    if (worksheet['!merges']) {
      worksheet['!merges'] = worksheet['!merges'].filter((range) => {
        // Check if the range corresponds to 'A1:C1'
        const isUnmergedRange =
          range.s.c === 0 &&
          range.e.c === 2 && // Columns A-C (0-indexed)
          range.s.r === 0 &&
          range.e.r === 0; // Row 1 (0-indexed)

        return !isUnmergedRange;
      });
    }

    delete worksheet['A1'];
    worksheet['C1'] = {
      v: 'Артикул',
      t: 's',
    };

    const rows = XLSX.utils.sheet_to_json(worksheet, {});
    console.log(rows);
  }
}
