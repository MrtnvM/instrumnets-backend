export type Product = {
  code: string;
  name: string;
  description: string;
  category: string;
  images: string[];
  thumbnail: string | null;
  categoryOrder: number;
  count: number;
  kPrice?: number;
  kbPrice?: number;
  oPrice?: number;
  nPrice?: number;
  rrcPrice?: number;
  price?: number;
};
