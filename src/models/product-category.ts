import { Product } from './product';

export type ProductCategory = {
  name: string;
  order: number;
  instruments: Product[];
};
