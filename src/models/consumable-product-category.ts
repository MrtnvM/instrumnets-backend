import { ConsumableProduct } from './consumable-product';

export type ConsumableProductCategory = {
  name: string;
  consumables: ConsumableProduct[];
};
