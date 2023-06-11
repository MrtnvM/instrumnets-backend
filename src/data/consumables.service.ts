import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Record, FieldSet } from 'airtable';
import { DB } from 'src/data/airtable-db';
import { FirebaseDB } from 'src/data/firebase-db';
import { ConsumableProduct } from 'src/models/consumable-product';
import { ConsumableProductCategory } from 'src/models/consumable-product-category';

export type RawConsumableProductMap = { [key: string]: Record<FieldSet> };
export type ConsumableProductMap = { [key: string]: ConsumableProduct };

@Injectable()
export class ConsumablesService {
  async getConsumablesFromAirtable() {
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
          'к',
          'кб',
          'о',
          'н',
          'ррц',
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

  async getConsumableProductMapFromAirtable(): Promise<RawConsumableProductMap> {
    const consumableProductsRecords = await DB()
      .ConsumablesTable.select({
        view: 'Grid view',
      })
      .all();

    const consumablesProductMap = consumableProductsRecords.reduce(
      (acc, record) => {
        const code = record.get('Артикул') as string;
        acc[code] = record;
        return acc;
      },
      {} as RawConsumableProductMap,
    );

    return consumablesProductMap;
  }

  async getCachedConsumableProductMap(
    clientCategory: string,
  ): Promise<ConsumableProductMap> {
    const cachedProducts = await this.getCachedConsumables(clientCategory);
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
    const products = await this.getConsumablesFromAirtable();
    await FirebaseDB().consumables.set(products);
    console.log('Consumables cache updated');
    return products;
  }

  async getCachedConsumables(
    clientCategory: string,
  ): Promise<ConsumableProductCategory[]> {
    let consumablesProducts: ConsumableProductCategory[] = [];

    const cachedConsumablesProductsSnaphot =
      await FirebaseDB().consumables.get();

    consumablesProducts = cachedConsumablesProductsSnaphot.val();

    if (!consumablesProducts) {
      consumablesProducts = await this.updateConsumablesCache();
    }

    const priceField =
      {
        к: 'kPrice',
        кб: 'kbPrice',
        о: 'oPrice',
        н: 'nPrice',
        ррц: 'rrcPrice',
      }[clientCategory] || 'rrcPrice';

    consumablesProducts.forEach((category) => {
      category.consumables.forEach((product) => {
        product.price = product[priceField];
        delete product.kbPrice;
        delete product.kPrice;
        delete product.oPrice;
        delete product.nPrice;
        delete product.rrcPrice;
      });
    });

    for (const category of consumablesProducts) {
      category.consumables = category.consumables.filter(
        (product) => product.price,
      );
    }

    return consumablesProducts;
  }
}
