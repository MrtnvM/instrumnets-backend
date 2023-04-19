import Airtable from 'airtable';

export const DB = () => {
  const airtable = new Airtable({
    apiKey: process.env.AIRTABLE_TOKEN,
  });

  const InstrumentsBase = airtable.base('appSYC2LG829A0Amj');
  const ProductTable = InstrumentsBase('Товары');
  const CategoryTable = InstrumentsBase('Категории');
  const OrderTable = InstrumentsBase('Заказы');
  const OrderItemsTable = InstrumentsBase('Товары в заказе');

  return { ProductTable, CategoryTable, OrderTable, OrderItemsTable };
};
