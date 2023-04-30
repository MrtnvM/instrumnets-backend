import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Product } from './models/product';
import { OrderDto } from './models/order.dto';
import { DB } from './data/airtable-db';
import { FirebaseDB } from './data/firebase-db';
import { Cron } from '@nestjs/schedule';
import { ProductCategory } from './models/product-category';

@Injectable()
export class AppService {
  constructor(private configService: ConfigService) {}

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

        const product: Product = {
          code: data['Код'],
          name: data['Наименование'],
          description,
          price: data['Цена'],
          category: categories.length > 0 ? categories[0] : null,
          images: images.map((image: any) => image.url),
          thumbnail: images.length > 0 ? images[0].thumbnails.large.url : null,
          categoryOrder:
            (data['Порядок категории'] && data['Порядок категории'][0]) || 100,
        };

        return product;
      })
      .filter(
        (instrument) =>
          instrument.name && instrument.thumbnail && instrument.price,
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

    console.log(groupedInstruments);

    return groupedInstruments;
  }

  // @Timeout(100)
  // async playground() {
  //   const products = await this.getCachedProducts();
  //   console.log(products);
  // }

  @Cron('0 */1 * * * *')
  async updateProductsCache() {
    const products = await this.getProducts();
    await FirebaseDB().products.set(products);
    console.log('Products cache updated');
    return products;
  }

  async getCachedProducts(): Promise<ProductCategory[]> {
    const cachedProductsSnaphot = await FirebaseDB().products.get();
    const cachedProducts = cachedProductsSnaphot.val();

    if (!cachedProducts) {
      const newProducts = await this.updateProductsCache();
      return newProducts;
    }

    return cachedProducts;
  }

  async createOrder(order: OrderDto) {
    try {
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

      const orderRecord = await DB().OrderTable.create({
        'ID пользователя': order.userId,
        Имя: order.firstName,
        Фамилия: order.lastName,
        Телефон: order.phone,
        Email: order.email,
        Адрес: order.address,
        Комментарий: order.comment,
        Компания: order.company,
        Город: order.city,
        'Дата создания': new Date().toISOString(),
      });

      // Split order items into separate groups by 10 items
      // because Airtable API has a limit of 10 items per request

      const GROUP_SIZE = 10;
      const orderItemsGroups = order.orderItems.reduce(
        (acc, item) => {
          const lastGroup = acc[acc.length - 1];

          if (lastGroup.length < GROUP_SIZE) {
            lastGroup.push(item);
          } else {
            acc.push([item]);
          }

          return acc;
        },
        [[]],
      );

      // Create order items in Airtable

      for (const orderItemsGroup of orderItemsGroups) {
        const orderItemsData = orderItemsGroup.map((item) => {
          const productRecord = productMap[item.productCode];

          return {
            fields: {
              Заказ: [orderRecord.getId()],
              Товар: [productRecord.getId()],
              Количество: item.count,
              'Цена на момент заказа': productRecord.get('Цена'),
            },
          };
        });

        await DB().OrderItemsTable.create(orderItemsData);
      }

      return { success: true };
    } catch (error) {
      console.error(error);
      throw new InternalServerErrorException({
        message: 'Ошибка создания заказа',
      });
    }
  }

  async getOrders(userId: string) {
    const cachedProducts = await this.getCachedProducts();
    const productMap = cachedProducts.reduce((acc, category) => {
      category.instruments.forEach((product) => {
        acc[product.code] = product;
      });
      return acc;
    }, {});

    const orders = await DB()
      .OrderTable.select({
        view: 'Список заказов',
        sort: [{ field: 'Дата создания', direction: 'desc' }],
        filterByFormula: `{ID пользователя} = "${userId}"`,
        fields: [
          'ID',
          'Адрес',
          'Комментарий',
          'Компания',
          'Город',
          'Дата создания',
          'Статус',
          'Коды товаров',
          'Сумма заказа',
        ],
      })
      .all();

    const ordersData = orders.map((order: any) => {
      const data = order.fields;

      return {
        id: data['ID'],
        address: data['Адрес'],
        comment: data['Комментарий'],
        company: data['Компания'],
        city: data['Город'],
        status: data['Статус'],
        createdAt: data['Дата создания'],
        products: data['Коды товаров'].map((item: string) => {
          const product = productMap[item];
          return {
            code: product.code,
            name: product.name,
            thumbnail: product.thumbnail,
          };
        }),
        totalPrice: data['Сумма заказа'],
      };
    });

    return ordersData;
  }
}
