export type Category = {
  description_category_id: number;
  category_name: string;
  disabled: boolean;
  children: CategoryWithItems[]; // Recursive type reference for nested categories
};

// If there are items that only have type_name and type_id,
// and you want to differentiate them from categories,
// you can introduce another type, like so:

type ItemType = {
  type_name: string;
  type_id: number;
  disabled: boolean;
  children: ItemType[];
};

// And then modify the Category type to include both Category and ItemType in children:

type CategoryWithItems = {
  description_category_id: number;
  category_name: string;
  disabled: boolean;
  children: ItemType[];
};

export type ProductDyna = {
  product_id: string;
  price: number;
  price_min: number;
  price_marketplace: number;
  price_dealer: number;
  vat: number;
  description_updated: string;
  stock: number;
  stock_warehouse: number;
  stock_express: number;
  stock_shops: number;
  stock_reserved: number;
  stock_used: number;
  stock_call: number;
  name: string;
  barcode: number;
  brand: string;
};

export type DynaItem = {
  product_id: string;
  name: string;
  name_full: string;
  brand: string;
  barcode: number;
  category_path: number[];
  product_type: string;
  model: string;
  modification: string;
  article: string;
  origin: string;
  image_main: string;
  images: Record<string, string>;
  description_updated: string;
  weight: number;
  length: number;
  width: number;
  height: number;
  video: string[];
  parameters: {
    [key: string]: string | number;
  };
  description: string;
}

type DynaItemResponse = {
  result: string;
  items_total: number;
  items_now: number;
  start: number;
  limit: number;
  product: ProductDyna[];
};