import { Injectable } from '@nestjs/common';
import { DB } from 'src/data/airtable-db';
import { CategoryDto } from './models/category.dto';

@Injectable()
export class CategoriesService {
  async getCategories() {
    const rawCategories = await DB()
      .CategoryTable.select({
        view: 'Grid view',
        fields: ['Название', 'Порядок', 'Изображение'],
      })
      .all();

    const categories: CategoryDto[] = rawCategories.map((category) => ({
      id: category.id as string,
      name: category.get('Название') as string,
      order: category.get('Порядок') as number,
      image: category.get('Изображение') as string,
    }));

    categories.sort((a, b) => a.order - b.order);

    return categories;
  }
}
