import Airtable from 'airtable';

export const DB = () => {
  const airtable = new Airtable({
    apiKey: process.env.AIRTABLE_TOKEN,
  });

  const baseId = process.env.AIRTABLE_BASE_ID;
  const InstrumentsBase = airtable.base(baseId);

  const ProductTable = InstrumentsBase('Товары');
  const CategoryTable = InstrumentsBase('Категории');
  const OrderTable = InstrumentsBase('Заказы');
  const OrderItemsTable = InstrumentsBase('Товары в заказе');
  const ConsumableOrderItemsTable = InstrumentsBase('Расходка в заказе');
  const PricesAndStockTable = InstrumentsBase('Цены и остатки');
  const ClientCategoriesTable = InstrumentsBase('Категории клиентов');
  const ConsumablesTable = InstrumentsBase('Расходка');
  const ConsumablesTempTable = InstrumentsBase('Расходка - temp');

  return {
    ProductTable,
    ConsumablesTable,
    ConsumablesTempTable,
    CategoryTable,
    OrderTable,
    OrderItemsTable,
    ConsumableOrderItemsTable,
    PricesAndStockTable,
    ClientCategoriesTable,
  };
};
