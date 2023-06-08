import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderDto } from './models/order.dto';
import { DB } from './data/airtable-db';
import { OrderProductData } from './models/order-product-data';
import { ConsumablesService } from './app-services/consumables.service';
import { ProductsService } from './app-services/products.service';
import { ClientCategoryService } from './app-services/client-category.service';
import { OderItemDto as OrderItemDto } from './models/order-item.dto';
import { ConsumableProduct } from './models/consumable-product';
import { Product } from './models/product';

@Injectable()
export class AppService {
  constructor(
    private configService: ConfigService,
    private consumablesService: ConsumablesService,
    private productsService: ProductsService,
    private clientCategoryService: ClientCategoryService,
  ) {}

  async getCachedAllProducts(clientEmail: string) {
    const clientCategory = await this.clientCategoryService.getClientCategory(
      clientEmail,
    );
    const cachedProducts = await this.productsService.getCachedProducts(
      clientCategory,
    );
    const getCachedConsumables =
      await this.consumablesService.getCachedConsumables();

    return {
      products: cachedProducts,
      consumables: getCachedConsumables,
    };
  }

  // @Timeout(100)
  // async playground() {
  //   const products = await this.getCachedProducts();
  //   console.log(products);
  // }

  async createOrder(order: OrderDto, email: string) {
    try {
      const clientCategory = await this.clientCategoryService.getClientCategory(
        email,
      );

      const productMap = await this.productsService.getProductMapFromAirtable();
      const consumableMap =
        await this.consumablesService.getConsumableProductMapFromAirtable();

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
        [[] as OrderItemDto[]],
      );

      // Create order items in Airtable

      for (const orderItemsGroup of orderItemsGroups) {
        const orderItemsData = orderItemsGroup.map((item) => {
          let productRecordId;
          let price;

          if (item.isConsumable) {
            const consumableRecord = consumableMap[item.productCode];
            productRecordId = consumableRecord.getId();
            price = consumableRecord.get('Цена');
          } else {
            const productRecord = productMap[item.productCode];
            productRecordId = productRecord.getId();
            price =
              productRecord.get(clientCategory) &&
              productRecord.get(clientCategory)[0];
          }

          return {
            fields: {
              Заказ: [orderRecord.getId()],
              Товар: [productRecordId],
              Количество: item.count,
              'Цена на момент заказа': price,
              'Расходник?': item.isConsumable,
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
    const clientCategory = await this.clientCategoryService.getClientCategory(
      null,
    );

    const productMap = this.productsService.getCachedProductMap(clientCategory);
    const consumablesMap =
      this.consumablesService.getCachedConsumableProductMap();

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
          let product: Product | ConsumableProduct;

          if (consumablesMap[item]) {
            product = consumablesMap[item];
          } else {
            product = productMap[item];
          }

          const count = orderProductsMap[item].count;
          const price = orderProductsMap[item].price;
          const isConsumable = orderProductsMap[item].isConsumable;

          return {
            code: product.code,
            name: product.name,
            thumbnail: product.thumbnail,
            price,
            count,
            isConsumable,
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
        fields: [
          'Код товара',
          'Количество',
          'Цена на момент заказа',
          'Расходник?',
        ],
        filterByFormula: `{ID заказа} = "${orderId}"`,
      })
      .all();

    return orderProductsData.map((item) => {
      const productCode = item.get('Код товара') as string;
      const count = item.get('Количество') as number;
      const price = item.get('Цена на момент заказа') as number;
      const isConsumable = item.get('Расходник?') as boolean;

      return {
        productCode,
        count,
        price,
        isConsumable,
      };
    });
  }

  async getClientProductMap(email: string) {
    const clientCategory = await this.clientCategoryService.getClientCategory(
      email,
    );
    const cachedProducts = await this.productsService.getCachedProducts(
      clientCategory,
    );
    const productMap = cachedProducts.reduce((acc, category) => {
      category.instruments.forEach((product) => {
        acc[product.code] = product;
      });
      return acc;
    }, {});

    return productMap;
  }
}
