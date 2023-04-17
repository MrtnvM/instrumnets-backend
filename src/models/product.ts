export type Product = {
  code: string;
  name: string;
  description: string;
  params: [string, string][];
  price: number;
  category: string;
  images: string[];
  thumbnail: string | null;
};
