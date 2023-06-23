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
import { DB } from 'src/data/airtable-db';

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

  @Post('playground')
  @UseGuards(ApiKeyGuard)
  @SetMetadata('apiKey', '34DXKqh^XDofLnN^Gk9ZaySoXS@xrJ3JEqT')
  @UseInterceptors(FileInterceptor('file'))
  async playground(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return {
        error: 'No file provided',
      };
    }
  }

  async updateConsumablesListByXlsx(@UploadedFile() file: Express.Multer.File) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const worksheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[worksheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {});

    const pricesAnsStocks = await DB()
      .PricesAndStockTable.select({
        view: 'База данных',
      })
      .all();

    const pricesAnsStocksMap = pricesAnsStocks.reduce((acc, item) => {
      const code = (item.get('Код товара') as string)?.trim()?.toUpperCase();
      if (!code) return acc;

      acc[code] = item;
      return acc;
    }, {});

    const consumables = rows
      .filter((row) => row['Код'] && row['Наименование'])
      .map((row) => ({
        code: row['Код'].trim().toUpperCase(),
        name: row['Наименование'].trim(),
      }));

    const existingConsumables = await DB()
      .ConsumablesTable.select({
        view: 'Grid view',
      })
      .all();

    const exisitingConsumablesMap = existingConsumables.reduce((acc, item) => {
      const code = (item.get('Артикул') as string)?.trim()?.toUpperCase();
      if (!code) return acc;

      acc[code] = item;
      return acc;
    }, {});

    const newConsumables = consumables.filter((consumable) => {
      return !exisitingConsumablesMap[consumable.code];
    });

    const newConsumablesRecords = newConsumables.map((item) => {
      const priceStockItem = pricesAnsStocksMap[item.code];
      const priceStockItemId = priceStockItem?.getId();

      const newRecord = {
        fields: {
          Артикул: item.code,
          Наименование: item.name,
          'Цены и остатки': priceStockItemId ? [priceStockItemId] : [],
        },
      };

      if (newRecord.fields['Цены и остатки'].length === 0) {
        delete newRecord.fields['Цены и остатки'];
      }

      return newRecord;
    });

    const GROUP_SIZE = 10;
    const newConsumablesGroups = newConsumablesRecords.reduce(
      (acc, item) => {
        const lastGroup = acc[acc.length - 1];

        if (lastGroup.length < GROUP_SIZE) {
          lastGroup.push(item);
        } else {
          acc.push([item]);
        }

        return acc;
      },
      [[] as any[]],
    );

    for (const group of newConsumablesGroups) {
      await DB().ConsumablesTable.create(group);
    }

    console.log(newConsumables);
  }
}
