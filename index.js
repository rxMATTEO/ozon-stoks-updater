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
})

console.log('listening on port 3001');
app.listen(3001);
