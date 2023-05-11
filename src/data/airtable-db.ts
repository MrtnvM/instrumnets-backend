import Airtable from 'airtable';

export const DB = () => {
  const airtable = new Airtable({
    apiKey: process.env.AIRTABLE_TOKEN,
  });

  const baseId = process.env.AIRTABLE_BASE_ID || 'appSYC2LG829A0Amj';
  const InstrumentsBase = airtable.base(baseId);

  const ProductTable = InstrumentsBase('Товары');
  const CategoryTable = InstrumentsBase('Категории');
  const OrderTable = InstrumentsBase('Заказы');
  const OrderItemsTable = InstrumentsBase('Товары в заказе');
  const PricesAndStockTable = InstrumentsBase('Цены и остатки');
  const ClientCategoriesTable = InstrumentsBase('Категории клиентов');

  return {
    ProductTable,
    CategoryTable,
    OrderTable,
    OrderItemsTable,
    PricesAndStockTable,
    ClientCategoriesTable,
  };
};
