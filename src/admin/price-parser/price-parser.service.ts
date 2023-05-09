import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';

@Injectable()
export class PriceParserService {
  private readonly logger = new Logger(PriceParserService.name);

  async parseXlsx(file: Buffer): Promise<any[]> {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const parsedRows = this.parseRows(sheet);
    return parsedRows;
  }

  private parseRows(sheet: XLSX.WorkSheet): any[] {
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
