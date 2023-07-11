export type ConsumableProduct = {
  code: string;
  name: string;
  category: string;
  detailedCategory: string | null;
  images: string[];
  thumbnail: string;
  unit: string;
  count: number;
  kPrice?: number;
  kbPrice?: number;
  oPrice?: number;
  nPrice?: number;
  rrcPrice?: number;
  price?: number;
};
