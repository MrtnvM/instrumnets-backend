import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Product } from './models/product';
import { OrderDto } from './models/order.dto';
import { DB } from './data/airtable-db';
import { FirebaseDB } from './data/firebase-db';
import { Cron } from '@nestjs/schedule';
import { ProductCategory } from './models/product-category';
import { OrderProductData } from './models/order-product-data';
import { ClientCatogory } from './models/client-category';
import { ConsumablesService } from './consumables/consumables.service';

@Injectable()
export class AppService {
  constructor(
    private configService: ConfigService,
    private consumablesService: ConsumablesService,
  ) {}

  async getCachedAllProducts(clientEmail: string) {
    const cachedProducts = await this.getCachedProducts(clientEmail);
    const getCachedConsumables =
      await this.consumablesService.getCachedConsumables();

    return {
      products: cachedProducts,
      consumables: getCachedConsumables,
    };
  }

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

  // @Timeout(100)
  // async playground() {
  //   const products = await this.getCachedProducts();
  //   console.log(products);
  // }

  async getClientCategories(): Promise<Record<string, ClientCatogory>> {
    const clientCategories = await DB()
      .ClientCategoriesTable.select({
        view: 'База данных',
        fields: ['Email', 'Категория'],
      })
      .all();

    const clientCategoriesData = clientCategories.map((category: any) => {
      const data = category.fields;
      return {
        email: data['Email'],
        category: data['Категория'],
      };
    });

    return clientCategoriesData.reduce<Record<string, ClientCatogory>>(
      (acc, category) => {
        const encodedEmail = Buffer.from(category.email).toString('base64');
        acc[encodedEmail] = category;
        return acc;
      },
      {},
    );
  }

  @Cron('*/15 * * * * *')
  async updateClientCategoriesCache() {
    const clientCategories = await this.getClientCategories();
    await FirebaseDB().clientCategories.set(clientCategories);
    console.log('Client categories cache updated');
    return clientCategories;
  }

  @Cron('0 */1 * * * *')
  async updateProductsCache() {
    const products = await this.getProducts();
    await FirebaseDB().products.set(products);
    console.log('Products cache updated');
    return products;
  }

  async getCachedClientCategories() {
    const cachedClientCategoriesSnaphot =
      await FirebaseDB().clientCategories.get();
    const cachedClientCategories: Record<string, ClientCatogory> =
      cachedClientCategoriesSnaphot.val();

    if (!cachedClientCategories) {
      const newClientCategories = await this.updateClientCategoriesCache();
      return newClientCategories;
    }

    return cachedClientCategories;
  }

  async getCachedProducts(
    clientEmail: string | null,
  ): Promise<ProductCategory[]> {
    let products: ProductCategory[] = [];

    const cachedProductsSnaphot = await FirebaseDB().products.get();
    products = cachedProductsSnaphot.val();

    if (!products) {
      products = await this.updateProductsCache();
    }

    const clientCategory = await this.getClientCategory(clientEmail);

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

  async createOrder(order: OrderDto, email: string) {
    try {
      const clientCategory = await this.getClientCategory(email);
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
          const price =
            productRecord.get(clientCategory) &&
            productRecord.get(clientCategory)[0];

          return {
            fields: {
              Заказ: [orderRecord.getId()],
              Товар: [productRecord.getId()],
              Количество: item.count,
              'Цена на момент заказа': price,
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
    const cachedProducts = await this.getCachedProducts(null);
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
          'Товар в заказе',
        ],
      })
      .all();

    const ordersDataRequests = orders.map(async (order: any) => {
      const data = order.fields;
      const orderID = data['ID'];

      const orderProductsData = await this.getOrderProductsData(orderID);

      const orderProductsMap: Record<string, OrderProductData> =
        orderProductsData.reduce((acc, record) => {
          const productCode = record.productCode;
          acc[productCode] = record;
          return acc;
        }, {});

      return {
        id: data['ID'],
        address: data['Адрес'],
        comment: data['Комментарий'],
        company: data['Компания'],
        city: data['Город'],
        status: data['Статус'],
        createdAt: data['Дата создания'],
        products: (data['Коды товаров'] || []).map((item: string) => {
          const product = productMap[item];

          const count = orderProductsMap[item].count;
          const price = orderProductsMap[item].price;

          return {
            code: product.code,
            name: product.name,
            thumbnail: product.thumbnail,
            price,
            count,
          };
        }),
        totalPrice: data['Сумма заказа'],
      };
    });

    const ordersData = await Promise.all(ordersDataRequests);

    return ordersData;
  }

  private async getOrderProductsData(
    orderId: string,
  ): Promise<OrderProductData[]> {
    const orderProductsData = await DB()
      .OrderItemsTable.select({
        view: 'База данных',
        fields: ['Код товара', 'Количество', 'Цена на момент заказа'],
        filterByFormula: `{ID заказа} = "${orderId}"`,
      })
      .all();

    return orderProductsData.map((item) => {
      const productCode = item.get('Код товара') as string;
      const count = item.get('Количество') as number;
      const price = item.get('Цена на момент заказа') as number;
      return {
        productCode,
        count,
        price,
      };
    });
  }

  async getClientCategory(email: string | null) {
    const defaultCategory = 'ррц';
    if (!email) return defaultCategory;

    const encodedEmail = Buffer.from(email).toString('base64');
    const categorySnapshot = await FirebaseDB()
      .clientCategories.child(encodedEmail)
      .get();

    const category = categorySnapshot.val();
    return category?.category || defaultCategory;
  }

  async getClientProductMap(email: string) {
    const cachedProducts = await this.getCachedProducts(email);
    const productMap = cachedProducts.reduce((acc, category) => {
      category.instruments.forEach((product) => {
        acc[product.code] = product;
      });
      return acc;
    }, {});

    return productMap;
  }
}
