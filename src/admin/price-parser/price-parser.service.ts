import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ProductInfo } from './models/priduct-info';
import { splitToAirtableChunks } from 'src/utils/groups';
import { DB } from 'src/data/airtable-db';
import { ProductsService } from 'src/data/products.service';
import { ConsumablesService } from 'src/data/consumables.service';

@Injectable()
export class PriceParserService {
  private readonly logger = new Logger(PriceParserService.name);

  constructor(
    private productsService: ProductsService,
    private consumablesService: ConsumablesService,
  ) {}

  async updatePrices(file: Buffer): Promise<ProductInfo[]> {
    const parsedProducts = await this.parsePricesAndCounts(file);
    await this.updatePricesInDb(parsedProducts);
    return parsedProducts;
  }

  private async updatePricesInDb(productsInfo: ProductInfo[]) {
    this.logger.log('Updating prices in db...');

    const [productMap, consumableMap] = await Promise.all([
      this.productsService.getProductMapFromAirtable(),
      this.consumablesService.getConsumableProductMapFromAirtable(),
    ]);

    this.logger.log('Loaded products and consumables from db');

    const priceAndStocksRecords = await DB()
      .PricesAndStockTable.select({
        view: 'База данных',
      })
      .all();

    this.logger.log('Loaded prices and stocks from db');

    const productInfoRecordsIds: Record<string, string> =
      priceAndStocksRecords.reduce((acc, record) => {
        const code = record.get('Код товара') as string;
        acc[code] = record.getId();
        return acc;
      }, {});

    const productsInfoMap: Record<string, ProductInfo> = productsInfo.reduce(
      (acc, item) => {
        acc[item.code] = item;
        return acc;
      },
      {},
    );

    const newProductsInfo = Object.values(
      productsInfo
        .filter((item) => !productInfoRecordsIds[item.code])
        .reduce((acc, item) => {
          acc[item.code] = item;
          return acc;
        }, {} as Record<string, ProductInfo>),
    );

    const getFields = (item: ProductInfo, isCreateMode: boolean) => {
      const productInfoRecord = productsInfoMap[item.code];
      const defaultValue = isCreateMode ? 0 : null;

      const fields = {
        'Код товара': productInfoRecord.code,
        к: productInfoRecord.kPrice || defaultValue,
        о: productInfoRecord.oPrice || defaultValue,
        н: productInfoRecord.nPrice || defaultValue,
        кб: productInfoRecord.kbPrice || defaultValue,
        ррц: productInfoRecord.rrcPrice || defaultValue,
        Количество: item.count || defaultValue,
      };

      const productRecordId = productMap[item.code]?.getId() as string;
      if (productRecordId) {
        fields['Товар'] = [productRecordId];
      }

      const consumableRecordId = consumableMap[item.code]?.getId() as string;
      if (consumableRecordId) {
        fields['Расходка'] = [consumableRecordId];
      }

      Object.keys(fields).forEach((key) => {
        if (fields[key] === null) {
          delete fields[key];
        }
      });

      return fields;
    };

    const newProductsInfoChunks = splitToAirtableChunks(newProductsInfo);

    // Create new product info records in Airtable

    for (const productsInfoChunk of newProductsInfoChunks) {
      const productInfoData = productsInfoChunk.map((item) => {
        const fields = getFields(item, true);
        return {
          fields,
        };
      });

      await DB().PricesAndStockTable.create(productInfoData);
    }

    this.logger.log('Creating new prices in db completed.');

    const existingProductsInfo = Object.values(
      productsInfo
        .filter((item) => productInfoRecordsIds[item.code])
        .reduce((acc, item) => {
          acc[item.code] = item;
          return acc;
        }, {} as Record<string, ProductInfo>),
    );

    const existingProductsInfoChunks =
      splitToAirtableChunks(existingProductsInfo);

    // Create order items in Airtable

    for (const productsInfoChunk of existingProductsInfoChunks) {
      const productInfoData = productsInfoChunk.map((item) => {
        const fields = getFields(item, false);
        const productInfoRecordId = productInfoRecordsIds[item.code];

        return {
          id: productInfoRecordId,
          fields,
        };
      });

      await DB().PricesAndStockTable.update(productInfoData);
    }

    this.logger.log('Updating prices in db completed.');
  }

  /// PARSING PRICES AND COUNTS FROM XLSX FILE

  private async parsePricesAndCounts(file: Buffer): Promise<ProductInfo[]> {
    this.logger.log('Parsing prices file...');
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = this.fixWorksheetArticulColumn(workbook.Sheets[sheetName]);
    const products = this.parseProductsInfo(sheet);
    this.logger.log(
      'Parsing prices file completed. Parsed products: ' + products.length,
    );
    return products;
  }

  private parseProductsInfo(sheet: XLSX.WorkSheet): ProductInfo[] {
    const rows = XLSX.utils.sheet_to_json(sheet, {});

    const products: ProductInfo[] = [];
    const notParsedRows = [];

    for (const row of rows) {
      const code = row['Код'] || row['Артикул'];
      const kPrice = row['к'] || row['Прайс К (р.)'] || row['Прайс К'];
      const kbPrice = row['кб'] || row['Прайс КБ (р.)'] || row['Прайс КБ'];
      const oPrice = row['о'] || row['Прайс О (р.)'] || row['Прайс О'];
      const nPrice = row['н'] || row['Прайс Н (р.)'] || row['Прайс Н'];
      const rrcPrice =
        row['РРЦ'] || row['ррц'] || row['Прайс РРЦ (р.)'] || row['Прайс РРЦ'];

      const count =
        row['Количество'] ||
        row['Кол-во'] ||
        row['Кол-во'] ||
        row['Остатки Казань'] ||
        row['остатки Казань'];

      const parsePrice = (price: string | number) => {
        if (typeof price === 'string') {
          const priceValueString = price
            .replace(/р\./, '')
            .replace(/,/, '.')
            .trim();

          const priceValue = parseFloat(priceValueString);

          if (isNaN(priceValue)) {
            return NaN;
          }

          return Math.ceil(priceValue);
        } else {
          return price;
        }
      };

      const product: ProductInfo = {
        code,
        kPrice: parsePrice(kPrice),
        kbPrice: parsePrice(kbPrice),
        oPrice: parsePrice(oPrice),
        nPrice: parsePrice(nPrice),
        rrcPrice: parsePrice(rrcPrice),
        count: parsePrice(count),
      };

      Object.keys(product).forEach((key) => {
        if (key !== 'code' && isNaN(product[key])) {
          delete product[key];
        }
      });

      if (product.code && Object.keys(product).length > 1) {
        products.push(product);
      } else {
        notParsedRows.push(row);
      }
    }

    return products;
  }

  /// FIXING XLSX FILE

  private fixWorksheetArticulColumn(worksheet: XLSX.WorkSheet) {
    const articulCellValue = {
      v: 'Артикул',
      t: 's',
    };

    if (worksheet['!merges']) {
      const isA1C1 = (range: XLSX.Range) => {
        // Check if the range corresponds to 'A1:C1'
        const isSearchedRange =
          range.s.c === 0 &&
          range.e.c === 2 && // Columns A-C (0-indexed)
          range.s.r === 0 &&
          range.e.r === 0; // Row 1 (0-indexed)

        return isSearchedRange;
      };

      if (worksheet['!merges'].some(isA1C1)) {
        worksheet['!merges'] = worksheet['!merges'].filter(
          (range) => !isA1C1(range),
        );

        delete worksheet['A1'];
        worksheet['C1'] = articulCellValue;
      }

      const isA1B1 = (range: XLSX.Range) => {
        // Check if the range corresponds to 'A1:B1'
        const isSearchedRange =
          range.s.c === 0 &&
          range.e.c === 1 && // Columns A-B (0-indexed)
          range.s.r === 0 &&
          range.e.r === 0; // Row 1 (0-indexed)

        return isSearchedRange;
      };

      if (worksheet['!merges'].some(isA1B1)) {
        worksheet['!merges'] = worksheet['!merges'].filter(
          (range) => !isA1B1(range),
        );

        delete worksheet['A1'];
        // worksheet['B1'] = articulCellValue;
      }
    }

    return worksheet;
  }
}
