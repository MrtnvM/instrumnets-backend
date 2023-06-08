import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DB } from 'src/data/airtable-db';
import { FirebaseDB } from 'src/data/firebase-db';
import { ConsumableProduct } from 'src/models/consumable-product';
import { ConsumableProductCategory } from 'src/models/consumable-product-category';

@Injectable()
export class ConsumablesService {
  async getConsumables() {
    const consumables = await DB()
      .ConsumablesTable.select({
        view: 'Grid view',
        fields: [
          'Артикул',
          'Фото',
          'Единица измерения',
          'Наименование',
          'Товарная группа',
          'Количество',
          'Цена',
        ],
        filterByFormula: '{Отображать} = 1',
      })
      .all();

    const productsData = consumables
      .map((productData: any) => {
        const data = productData.fields;
        const images = data['Фото'] || [];
        const categories = data['Товарная группа'] || [];

        const thumbnail =
          images.length > 0 //
            ? images[0].thumbnails?.large?.url || images[0].url || null
            : null;

        const product: ConsumableProduct = {
          code: data['Артикул'],
          name: data['Наименование'],
          category:
            typeof categories === 'string'
              ? categories
              : categories.length > 0
              ? categories[0]
              : null,
          images: images.map((image: any) => image.url),
          thumbnail,
          unit: data['Единица измерения'],
          price: data['Цена'],
          count: data['Количество'],
        };

        return product;
      })
      .filter(
        (instrument) =>
          instrument.name && instrument.thumbnail && instrument.count > 0,
      );

    const groupedConsumableProducts = productsData.reduce<
      {
        name: string;
        consumables: ConsumableProduct[];
      }[]
    >((acc, instrument) => {
      const { category } = instrument;

      let group = acc.find((group) => group.name === category);

      if (!group) {
        group = {
          name: category,
          consumables: [],
        };

        acc.push(group);
      }

      group.consumables.push(instrument);
      return acc;
    }, []);

    return groupedConsumableProducts;
  }

  async getConsumableProductMapFromAirtable() {
    const consumableProductsRecords = await DB()
      .ProductTable.select({
        view: 'Grid view',
      })
      .all();

    const consumablesProductMap = consumableProductsRecords.reduce(
      (acc, record) => {
        const code = record.get('Артикул') as string;
        acc[code] = record;
        return acc;
      },
      {},
    );

    return consumablesProductMap;
  }

  async getCachedConsumableProductMap() {
    const cachedProducts = await this.getCachedConsumables();
    const productMap = cachedProducts.reduce((acc, category) => {
      category.consumables.forEach((product) => {
        acc[product.code] = product;
      });
      return acc;
    }, {});

    return productMap;
  }

  @Cron('0 */1 * * * *')
  async updateConsumablesCache() {
    const products = await this.getConsumables();
    await FirebaseDB().consumables.set(products);
    console.log('Consumables cache updated');
    return products;
  }

  async getCachedConsumables(): Promise<ConsumableProductCategory[]> {
    let consumablesProducts: ConsumableProductCategory[] = [];

    const cachedConsumablesProductsSnaphot =
      await FirebaseDB().consumables.get();

    consumablesProducts = cachedConsumablesProductsSnaphot.val();

    if (!consumablesProducts) {
      consumablesProducts = await this.updateConsumablesCache();
    }

    for (const category of consumablesProducts) {
      category.consumables = category.consumables.filter(
        (product) => product.price,
      );
    }

    return consumablesProducts;
  }
}
