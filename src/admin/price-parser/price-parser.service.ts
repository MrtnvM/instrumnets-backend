import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ProductInfo } from './models/priduct-info';
import { splitToAirtableChunks } from 'src/utils/groups';
import { DB } from 'src/data/airtable-db';

@Injectable()
export class PriceParserService {
  private readonly logger = new Logger(PriceParserService.name);

  async updatePrices(file: Buffer): Promise<ProductInfo[]> {
    const parsedProducts = await this.parseXlsx(file);
    await this.updatePricesInDb(parsedProducts);
    return parsedProducts;
  }

  async updatePricesInDb(productsInfo: ProductInfo[]) {
    this.logger.log('Updating prices in db...');

    const productsRecords = await DB()
      .ProductTable.select({
        view: 'Site',
      })
      .all();

    const productMap = productsRecords.reduce((acc, record) => {
      const code = record.get('Код') as string;
      acc[code] = record;
      return acc;
    }, {});

    const productInfoRecords = await DB()
      .PricesAndStockTable.select({
        view: 'База данных',
      })
      .all();

    const productInfoRecordsIds: Record<string, string> =
      productInfoRecords.reduce((acc, record) => {
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

    const newProductsInfo = productsInfo.filter(
      (item) => !productInfoRecordsIds[item.code],
    );

    const getFields = (item: ProductInfo) => {
      const productInfoRecord = productsInfoMap[item.code];
      const productRecordId = productMap[item.code]?.getId() as string;

      const fields = {
        'Код товара': productInfoRecord.code,
        к: productInfoRecord.kPrice || 0,
        о: productInfoRecord.oPrice || 0,
        н: productInfoRecord.nPrice || 0,
        кб: productInfoRecord.kbPrice || 0,
        ррц: productInfoRecord.rrcPrice || 0,
        Количество: item.count,
        Товар: productRecordId ? [productRecordId] : undefined,
      };

      return fields;
    };

    const newProductsInfoChunks = splitToAirtableChunks(newProductsInfo);

    // Create new product info records in Airtable

    for (const productsInfoChunk of newProductsInfoChunks) {
      const productInfoData = productsInfoChunk.map((item) => {
        const fields = getFields(item);
        return {
          fields,
        };
      });

      await DB().PricesAndStockTable.create(productInfoData);
    }

    const existingProductsInfo = productsInfo.filter(
      (item) => productInfoRecordsIds[item.code],
    );
    const existingProductsInfoChunks =
      splitToAirtableChunks(existingProductsInfo);

    // Create order items in Airtable

    for (const productsInfoChunk of existingProductsInfoChunks) {
      const productInfoData = productsInfoChunk.map((item) => {
        const fields = getFields(item);
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

  async parseXlsx(file: Buffer): Promise<ProductInfo[]> {
    this.logger.log('Parsing prices file...');
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const products = this.parseProductsInfo(sheet);
    this.logger.log(
      'Parsing prices file completed. Parsed products: ' + products.length,
    );
    return products;
  }

  private parseProductsInfo(sheet: XLSX.WorkSheet): any[] {
    const rows = XLSX.utils.sheet_to_json(sheet, {});

    const products = [];
    const notParsedRows = [];

    for (const row of rows) {
      const product = {
        code: row['Артикул'],
        kbPrice: row['Прайс КБ (р.)'],
        oPrice: row['Прайс О (р.)'],
        nPrice: row['Прайс Н (р.)'],
        count: row['Кол-во'],
      };

      if (product.code) {
        products.push(product);
      } else {
        notParsedRows.push(row);
      }
    }

    return products;
  }
}
