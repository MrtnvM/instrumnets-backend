import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DB } from 'src/data/airtable-db';
import { FirebaseDB } from 'src/data/firebase-db';
import { ConsumableProduct } from 'src/models/consumable-product';
import { ConsumableProductCategory } from 'src/models/consumable-product-category';
import { Product } from 'src/models/product';
import { ProductCategory } from 'src/models/product-category';

@Injectable()
export class ProductsService {
  async getProducts() {
    const instruments = await DB()
      .ProductTable.select({
        view: 'Site',
        fields: [
          'Код',
          'Наименование',
          'Характеристики',
          'Цена',
          'Название категорий',
          'Фото товара',
          'Порядок категории',
          'Количество',
          'к',
          'кб',
          'о',
          'н',
          'ррц',
        ],
        filterByFormula: '{Отображается} = 1',
      })
      .all();

    const instrumentsData = instruments
      .map((instrument: any) => {
        const data = instrument.fields;
        const images = data['Фото товара'] || [];
        const categories = data['Название категорий'] || [];

        const description = data['Характеристики'] || '';

        const category =
          typeof categories === 'string'
            ? categories
            : categories.length > 0
            ? categories[0]
            : null;

        const product: Product = {
          code: data['Код'],
          name: data['Наименование'],
          description,
          category,
          images: images.map((image: any) => image.url),
          thumbnail: images.length > 0 ? images[0].thumbnails.large.url : null,
          categoryOrder:
            (data['Порядок категории'] && data['Порядок категории'][0]) || 1000,
          kbPrice: data['кб'] && data['кб'][0],
          kPrice: data['к'] && data['к'][0],
          oPrice: data['о'] && data['о'][0],
          nPrice: data['н'] && data['н'][0],
          rrcPrice: data['ррц'] && data['ррц'][0],
          count: (data['Количество'] && data['Количество'][0]) || 0,
        };

        return product;
      })
      .filter(
        (instrument) =>
          instrument.name && instrument.thumbnail && instrument.count > 0,
      );

    const groupedInstruments = instrumentsData.reduce<
      {
        name: string;
        instruments: Product[];
        order: number;
      }[]
    >((acc, instrument) => {
      const { category, categoryOrder } = instrument;

      let group = acc.find((group) => group.name === category);

      if (!group) {
        group = {
          name: category,
          instruments: [],
          order: categoryOrder,
        };

        acc.push(group);
      }

      group.instruments.push(instrument);
      return acc;
    }, []);

    groupedInstruments.sort((a, b) => {
      return a.order - b.order;
    });

    return groupedInstruments;
  }

  @Cron('0 */1 * * * *')
  async updateProductsCache() {
    const products = await this.getProducts();
    await FirebaseDB().products.set(products);
    console.log('Products cache updated');
    return products;
  }

  async getCachedProducts(clientCategory: string): Promise<ProductCategory[]> {
    let products: ProductCategory[] = [];

    const cachedProductsSnaphot = await FirebaseDB().products.get();
    products = cachedProductsSnaphot.val();

    if (!products) {
      products = await this.updateProductsCache();
    }

    const priceField =
      {
        к: 'kPrice',
        кб: 'kbPrice',
        о: 'oPrice',
        н: 'nPrice',
        ррц: 'rrcPrice',
      }[clientCategory] || 'rrcPrice';

    products.forEach((category) => {
      category.instruments.forEach((instrument) => {
        instrument.price = instrument[priceField];
        delete instrument.kbPrice;
        delete instrument.kPrice;
        delete instrument.oPrice;
        delete instrument.nPrice;
        delete instrument.rrcPrice;
      });
    });

    for (const category of products) {
      category.instruments = category.instruments.filter(
        (instrument) => instrument.price,
      );
    }

    return products;
  }
}
