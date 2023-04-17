import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Airtable from 'airtable';
import { Product } from './models/product';

@Injectable()
export class AppService {
  constructor(private configService: ConfigService) {}

  async getProducts() {
    const airtable = new Airtable({
      apiKey: this.configService.get('AIRTABLE_TOKEN'),
    });

    const InstrumentsBase = airtable.base('appSYC2LG829A0Amj');
    const InstrumentsTable = InstrumentsBase('Товары');
    // const CategoriesTable = InstrumentsBase('Категории')

    const instruments = await InstrumentsTable.select({
      view: 'Site',
      fields: [
        'Код',
        'Наименование',
        'Описание',
        'Характеристики',
        'Цена',
        'Название категорий',
        'Фото товара',
      ],
    }).all();

    const instrumentsData = instruments
      .map((instrument: any) => {
        const data = instrument.fields;
        const images = data['Фото товара'] || [];
        const categories = data['Название категорий'] || [];

        const description = data['Описание'] || null;
        const paramsText = data['Характеристики'] || null;
        const params =
          paramsText &&
          paramsText.split('\n').map((param: string) => {
            const [key, value] = param.split(':');
            return key && value ? [key.trim(), value.trim()] : [key.trim()];
          });

        const product: Product = {
          code: data['Код'],
          name: data['Наименование'],
          description,
          price: data['Цена'],
          params,
          category: categories.length > 0 ? categories[0] : null,
          images: images.map((image: any) => image.url),
          thumbnail: images.length > 0 ? images[0].thumbnails.large.url : null,
        };

        return product;
      })
      .filter((instrument) => instrument.name && instrument.thumbnail);

    const groupedInstruments = instrumentsData.reduce((acc, instrument) => {
      const { category } = instrument;

      let group = acc.find((group) => group.name === category);

      if (!group) {
        group = {
          name: category,
          instruments: [],
        };

        acc.push(group);
      }

      group.instruments.push(instrument);
      return acc;
    }, []);

    console.log(groupedInstruments);

    return groupedInstruments;
  }
}
