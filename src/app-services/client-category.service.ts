import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DB } from 'src/data/airtable-db';
import { FirebaseDB } from 'src/data/firebase-db';
import { ClientCatogory } from 'src/models/client-category';

@Injectable()
export class ClientCategoryService {
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
}
