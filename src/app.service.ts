import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderDto } from './models/order.dto';
import { DB } from './data/airtable-db';
import { OrderProductData } from './models/order-product-data';
import { ConsumablesService } from './app-services/consumables.service';
import {
  RawProductMap,
  ProductsService,
} from './app-services/products.service';
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
        const productOrderItems = orderItemsGroup.filter(
          (item) => !item.isConsumable,
        );

        const consumableOrderItems = orderItemsGroup.filter(
          (item) => item.isConsumable,
        );

        await Promise.all([
          this.createProductOrderItems(
            productOrderItems,
            productMap,
            orderRecord.getId(),
            clientCategory,
          ),
          this.createConsumableProductOrderItems(
            consumableOrderItems,
            consumableMap,
            orderRecord.getId(),
          ),
        ]);
      }

      return { success: true };
    } catch (error) {
      console.error(error);
      throw new InternalServerErrorException({
        message: 'Ошибка создания заказа',
      });
    }
  }

  async createProductOrderItems(
    orderItemsGroup: OrderItemDto[],
    productMap: RawProductMap,
    orderRecordId: string,
    clientCategory: string,
  ) {
    if (orderItemsGroup.length === 0) {
      return;
    }

    const productOrderItemsData = orderItemsGroup.map((item) => {
      const productRecord = productMap[item.productCode];
      const productRecordId = productRecord.getId();
      const price =
        productRecord.get(clientCategory) &&
        productRecord.get(clientCategory)[0];

      return {
        fields: {
          Заказ: [orderRecordId],
          Товар: [productRecordId],
          Количество: item.count,
          'Цена на момент заказа': price,
        },
      };
    });

    await DB().OrderItemsTable.create(productOrderItemsData);
  }

  async createConsumableProductOrderItems(
    orderItemsGroup: OrderItemDto[],
    consumableMap: RawProductMap,
    orderRecordId: string,
  ) {
    if (orderItemsGroup.length === 0) {
      return;
    }

    const productOrderItemsData = orderItemsGroup.map((item) => {
      const consumableRecord = consumableMap[item.productCode];
      const consumableProductRecordId = consumableRecord.getId();
      const price = consumableRecord.get('Цена');

      return {
        fields: {
          Заказ: [orderRecordId],
          Расходка: [consumableProductRecordId],
          Количество: item.count,
          'Цена на момент заказа': price,
        },
      };
    });

    await DB().ConsumableOrderItemsTable.create(productOrderItemsData);
  }

  async getOrders(userId: string) {
    const clientCategory = await this.clientCategoryService.getClientCategory(
      null,
    );

    const [productMap, consumablesMap] = await Promise.all([
      this.productsService.getCachedProductMap(clientCategory),
      this.consumablesService.getCachedConsumableProductMap(),
    ]);

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
          'Артикулы расходки',
          'Сумма заказа',
          'Товар в заказе',
          'Расходка в заказе',
        ],
      })
      .all();

    const ordersDataRequests = orders.map(async (order: any) => {
      const data = order.fields;
      const orderID = data['ID'];

      const orderProductsData = await this.getOrderProductsData(orderID);
      const orderConsumablesData = await this.getConsumableOrderProductsData(
        orderID,
      );

      const orderProductsMap: Record<string, OrderProductData> =
        orderProductsData.reduce((acc, record) => {
          const productCode = record.productCode;
          acc[productCode] = record;
          return acc;
        }, {});

      const orderConsumablesMap: Record<string, OrderProductData> =
        orderConsumablesData.reduce((acc, record) => {
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
          const orderItem = orderProductsMap[item];

          return {
            code: product.code,
            name: product.name,
            thumbnail: product.thumbnail,
            price: orderItem.price,
            count: orderItem.count,
            isConsumable: orderItem.isConsumable,
          };
        }),
        consumables: (data['Артикулы расходки'] || []).map((item: string) => {
          const product = consumablesMap[item];
          const orderItem = orderConsumablesMap[item];

          return {
            code: product.code,
            name: product.name,
            thumbnail: product.thumbnail,
            price: orderItem.price,
            count: orderItem.count,
            isConsumable: orderItem.isConsumable,
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
        isConsumable: false,
      };
    });
  }

  private async getConsumableOrderProductsData(
    orderId: string,
  ): Promise<OrderProductData[]> {
    const orderProductsData = await DB()
      .ConsumableOrderItemsTable.select({
        view: 'База данных',
        fields: ['Артикул', 'Количество', 'Цена на момент заказа'],
        filterByFormula: `{ID заказа} = "${orderId}"`,
      })
      .all();

    return orderProductsData.map((item) => {
      const productCode = item.get('Артикул') as string;
      const count = item.get('Количество') as number;
      const price = item.get('Цена на момент заказа') as number;

      return {
        productCode,
        count,
        price,
        isConsumable: true,
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
