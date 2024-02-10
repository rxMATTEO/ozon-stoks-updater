import {Category, DynaItem, ProductDyna} from "./types";

const express = require('express');
const cors = require("cors");
const app = express();
const axios = require('axios');
const {OZON_API_KEY, OZON_CLIENT_ID, LTM_API_KEY} = require('dotenv').config().parsed;

app.use(cors());
app.use(express.static('dist'));
app.use(express.json());

const ltmItems = async (page) => await axios.get(`https://ltm-music.ru/api/product/?limit=500&page=${page}`, {
  headers: {
    Authorization: LTM_API_KEY
  }
});

const ozonListItems = async (lastId) => await axios.post('https://api-seller.ozon.ru/v2/product/list', {
  limit: 1000,
  last_id: lastId
}, {
  headers: {
    'Content-Type': 'application/json',
    'Client-Id': OZON_CLIENT_ID,
    'Api-Key': OZON_API_KEY
  },
});

async function getLtmList() {
  const {data: listFirst} = await ltmItems(1);
  const pages = listFirst.nav.page_count;
  const list = [...listFirst.products];
  for (let i = 2; i <= pages; i++) {
    const newList = await ltmItems(i);
    list.push(...newList.data.products)
  }
  return list;
}

async function findLtmBuyArt(art, list) {
  for (const item of list) {
    for (const offer of item.offers) {
      if (offer.bar_code == art) {
        return offer;
      }

    }
  }
  // return list.find(el => el.offers.find(offer => offer.bar_code == art));
}

async function getOzonList() {
  const ozonList = await ozonListItems(null);
  const list = [...ozonList.data.result.items];
  const limit = ozonList.data.result.total;
  const pages = Math.ceil(limit / 1000);
  let lastId = ozonList.data.result.last_id;
  for (let i = 2; i <= pages; i++) {
    const newList = await ozonListItems(lastId);
    lastId = ozonList.data.result.last_id;
    list.push(...newList.data.result.items)
  }
  return list;
}

async function getOzonWarehouses() {
//   POST https://api-seller.ozon.ru/v1/warehouse/list
  const ozonWarehouses = (await axios.post('https://api-seller.ozon.ru/v1/warehouse/list', {}, {
    headers: {
      'Content-Type': 'application/json',
      'Client-Id': OZON_CLIENT_ID,
      'Api-Key': OZON_API_KEY
    }
  })).data.result;

  const warehousesHuman = {
    msk: ozonWarehouses.find(i => i.name === 'Спасское_ПВЗ'),
    nsb: ozonWarehouses.find(i => i.name === 'Новосибирск_ПВЗ')
  }
  return warehousesHuman;
}

async function postStocks(ozonWarehouses, bothSidesArray) {
  // POST https://api-seller.ozon.ru/v2/products/stocks
  const stocks = bothSidesArray.map(i => {
    return [{
      offer_id: i.ozon.offer_id,
      product_id: i.ozon.product_id,
      stock: i.ltm.stores.find(i => i.code === 'moscow').quantity,
      warehouse_id: ozonWarehouses.msk.warehouse_id
    },
      {
        offer_id: i.ozon.offer_id,
        product_id: i.ozon.product_id,
        stock: i.ltm.stores.find(i => i.code === 'novosibirsk').quantity,
        warehouse_id: ozonWarehouses.nsb.warehouse_id
      },
    ]
  }).flat().map(i => {
    if (i.stock > 100) {
      i.stock = 100;
    }
    return i;
  })
  const requestsCount = Math.ceil(stocks.length / 100);
  for (let i = 0; i < requestsCount; i++) {
    setTimeout(async () => {
      console.log('on it');
      const result = await axios.post('https://api-seller.ozon.ru/v2/products/stocks', {
        stocks: stocks.slice(i * 100, (i + 1) * 100),
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Client-Id': OZON_CLIENT_ID,
          'Api-Key': OZON_API_KEY
        }
      });
      console.log(result.data)
      console.log(i === requestsCount - 1 ? 'DONE' : `not done ${i} of ${requestsCount - 1}`);
      return result.data;
    }, i * 126000);
  }
}

async function matchBothSides(ozonList) {
  const result = [];
  const ltmList = await getLtmList();
  for (const resultElement of ozonList) {
    const ltmBuyArt = await findLtmBuyArt(resultElement.offer_id, ltmList);
    if (ltmBuyArt) {
      result.push({
        ozon: resultElement,
        ltm: ltmBuyArt
      });
    }
  }
  return result;
}

app.get('/api/update/ltm', async (req, res) => {
  const ozonList = await getOzonList();
  const bothSidesArray = await matchBothSides(ozonList);
  const ozonWarehouses = await getOzonWarehouses();
  res.send(await postStocks(ozonWarehouses, bothSidesArray));
});

async function fetchOzonCategories() {
  return (await axios.post('https://api-seller.ozon.ru/v1/description-category/tree', {}, {
    headers: {
      'Content-Type': 'application/json',
      'Client-Id': OZON_CLIENT_ID,
      'Api-Key': OZON_API_KEY
    },
  })).data.result;
}

async function fetchDynatoneItems(): Promise<{ product: ProductDyna[] }> {
  return (await axios.get('https://apidnt.ru/v2/product/list?key=20EABd8c-2594-1028-524C-2D91-E3E582F4Ae58&fields=name,barcode,brand&limit=10&start=50')).data;
}

async function fetchDynaInfo(item: ProductDyna): Promise<DynaItem> {
  return (await axios.get(`https://apidnt.ru/v2/product/info/?key=20EABd8c-2594-1028-524C-2D91-E3E582F4Ae58&product_id=${item.product_id}&add_video=1&add_parameters=1`)).data;
}

async function findOzonCategory(ozonCats: Category[], items: ProductDyna) {
  const fetchInfo = await fetchDynaInfo(items);
  return ozonCats.find(cat => cat.children.find(i => i.children.find(i => {
    console.log(i.type_name, fetchInfo.product_type);
    i.type_name.includes(fetchInfo.product_type)
  })));
}

async function postOzonItems(dynaItems: ProductDyna[]) {
  // POST https://api-seller.ozon.ru/v2/products/stocks
  return (await axios.post('https://api-seller.ozon.ru/v3/product/import', {
    items: [
      {
        barcode: '19954500153',
        dimension_unit: 'cm',
        height: 2,
        "images": [
          "https://cdn.liveimg.ru/img/cache/crp/11291_46870~sz89983.jpg",
          "https://cdn.liveimg.ru/img/cache/crp/11291_46871~sz237961.jpg"
        ],
        name: 'EVANS TT10G1 - Пластик 10"',
        offer_id: 'DNT-11291',
        price: '2310',
        vat: '0',
        weight_unit: 'g',
        weight: 136,
        width: 27,
      }
    ]
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Client-Id': OZON_CLIENT_ID,
      'Api-Key': OZON_API_KEY
    }
  })).data;
}

app.get('/api/upload/apidnt', async (req, res) => {
  // const categories = await fetchOzonCategories();
  // const dynaCat = await findOzonCategory(categories, items.product[0]);
  const items = await fetchDynatoneItems();
  const postedItems = await postOzonItems(items.product);
  res.send(postedItems);
})

console.log('listening on port 3001');
app.listen(3001);