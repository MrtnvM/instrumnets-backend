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

    const getFields = (item: ProductInfo, isCreateMode: boolean) => {
      const productInfoRecord = productsInfoMap[item.code];
      const productRecordId = productMap[item.code]?.getId() as string;

      const defaultValue = isCreateMode ? 0 : null;

      const fields = {
        'Код товара': productInfoRecord.code,
        к: productInfoRecord.kPrice || defaultValue,
        о: productInfoRecord.oPrice || defaultValue,
        н: productInfoRecord.nPrice || defaultValue,
        кб: productInfoRecord.kbPrice || defaultValue,
        ррц: productInfoRecord.rrcPrice || defaultValue,
        Количество: item.count || defaultValue,
        Товар: productRecordId ? [productRecordId] : undefined,
      };

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

    const existingProductsInfo = productsInfo.filter(
      (item) => productInfoRecordsIds[item.code],
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

  async parseXlsx(file: Buffer): Promise<ProductInfo[]> {
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

  async updatePrices2(file: Buffer): Promise<ProductInfo[]> {
    const parsedProducts = await this.parseXlsx2(file);
    await this.updatePricesInDb(parsedProducts);
    return parsedProducts;
  }

  async parseXlsx2(file: Buffer): Promise<ProductInfo[]> {
    this.logger.log('Parsing prices file...');
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = this.fixWorksheetArticulColumn(workbook.Sheets[sheetName]);
    const products = this.parseProductsInfo2(sheet);
    this.logger.log(
      'Parsing prices file completed. Parsed products: ' + products.length,
    );
    return products;
  }

  private parseProductsInfo2(sheet: XLSX.WorkSheet): ProductInfo[] {
    const rows = XLSX.utils.sheet_to_json(sheet, {});

    const products: ProductInfo[] = [];
    const notParsedRows = [];

    for (const row of rows) {
      const product: ProductInfo = {
        code: row['Код'],
        kbPrice: Math.ceil(row['к']),
        oPrice: Math.ceil(row['кб']),
        nPrice: Math.ceil(row['н']),
        rrcPrice: Math.ceil(row['РРЦ']),
      };

      Object.keys(product).forEach((key) => {
        if (key !== 'code' && isNaN(product[key])) {
          delete product[key];
        }
      });

      if (product.code) {
        products.push(product);
      } else {
        notParsedRows.push(row);
      }
    }

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
        kPrice: row['Прайс К (р.)'],
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

  private fixWorksheetArticulColumn(worksheet: XLSX.WorkSheet) {
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

    return worksheet;
  }
}
