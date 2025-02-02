import {Category, DynaItem, DynaItemResponse, ProductDyna} from "./types";
import {Server} from "socket.io";
import {clearTimeout} from "node:timers";
import * as path from "node:path";
import * as fs from "node:fs";
import XLSX from 'xlsx'

const express = require('express');
const cors = require("cors");
const app = express();
const axios = require('axios');
const {OZON_OFFER_SHOP_API_KEY, LTM_API_KEY, TARBOC_WAREHOUSE_DOCUMENT_PATH,
  OZON_MUSIC_SHOP_CLIENT_ID,
  OZON_MUSIC_SHOP_API_KEY ,OZON_OFFER_SHOP_CLIENT_ID, DYNATON_API_KEY} = require('dotenv').config().parsed;
const http = require('http');
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
  }
});
const intervalId = [];

io.on('connection', (socket) => {
  console.log('client socket connected');
  socket.on('stop', () => {
    intervalId.forEach(i => clearTimeout(i));
  });
});

app.use(cors());
app.use(express.static('dist'));
app.use(express.json({limit: '50mb'}));

const ltmItems = async (page) => {
  const result = await fetch(`https://ltm-music.ru/api/product/?limit=500&page=${page}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      Authorization: LTM_API_KEY,
      url: `https://ltm-music.ru/api/product/?limit=500&page=${page}`,
      'Accept-Encoding': 'gzip, deflate, br, *',
    }
  });
  const json = await result.json();
  return { data: json };
}

const ozonListItems = async (lastId, { clientId = OZON_OFFER_SHOP_CLIENT_ID, apiKey = OZON_OFFER_SHOP_API_KEY } = {}) => await axios.post('https://api-seller.ozon.ru/v3/product/list', {
  limit: 1000,
  last_id: lastId,
  filter: {
    visibility: 'ALL',
  }
}, {
  headers: {
    'Content-Type': 'application/json',
    'Client-Id': clientId,
    'Api-Key': apiKey
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

async function getOzonList({ clientId = OZON_OFFER_SHOP_CLIENT_ID, apiKey = OZON_OFFER_SHOP_API_KEY } = {}) {
  const ozonList = await ozonListItems(null, { clientId, apiKey });
  const list = [...ozonList.data.result.items];
  const limit = ozonList.data.result.total;
  const pages = Math.ceil(limit / 1000);
  let lastId = ozonList.data.result.last_id;
  for (let i = 2; i <= pages; i++) {
    const newList = await ozonListItems(lastId, { clientId, apiKey });
    lastId = ozonList.data.result.last_id;
    list.push(...newList.data.result.items)
  }
  return list;
}

async function getOzonWarehouses({ clientId = OZON_OFFER_SHOP_CLIENT_ID, apiKey = OZON_OFFER_SHOP_API_KEY } = {}) {
//   POST https://api-seller.ozon.ru/v1/warehouse/list
  const ozonWarehouses = (await axios.post('https://api-seller.ozon.ru/v1/warehouse/list', {}, {
    headers: {
      'Content-Type': 'application/json',
      'Client-Id': clientId,
      'Api-Key': apiKey
    }
  })).data.result;

  const warehousesHuman = {
    msk: ozonWarehouses.find(i => i.name === 'Дубликат_Спасское_ПВЗ'),
    nsb: ozonWarehouses.find(i => i.name === 'Новосибирск_ПВЗ'),
    dynaton: ozonWarehouses.find(i => i.name === 'Динатон'),
    balashiha: ozonWarehouses.find(i => i.name === 'Балашиха'),
  }
  return warehousesHuman;
}

function getExcelSheet(filePath = TARBOC_WAREHOUSE_DOCUMENT_PATH){
  const fileBuffer = fs.readFileSync(filePath);

// Parse the file
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

// Get the first sheet name
  const sheetName = workbook.SheetNames[0];

// Get the first sheet
  const sheet = workbook.Sheets[sheetName];

// Convert sheet to JSON
  const data = XLSX.utils.sheet_to_json(sheet);
  return data;
}

async function postStocks(ozonWarehouses, bothSidesArray,
                          {
                            getStocks = (item) => item.ltm.stores.find(i => i.code === 'moscow').quantity,
                            getWarehouse = (ozonWarehouses) => ozonWarehouses.msk.warehouse_id,
                            clientId = OZON_OFFER_SHOP_CLIENT_ID,
                            apiKey = OZON_OFFER_SHOP_API_KEY,
                          } = {}) {
  // POST https://api-seller.ozon.ru/v2/products/stocks
  const stocks = bothSidesArray.map(i => {
    return [{
      offer_id: i.ozon.offer_id,
      product_id: i.ozon.product_id,
      stock: getStocks(i),
      warehouse_id: getWarehouse(ozonWarehouses)
    },
      // {
      //   offer_id: i.ozon.offer_id,
      //   product_id: i.ozon.product_id,
      //   stock: i.ltm.stores.find(i => i.code === 'novosibirsk').quantity,
      //   warehouse_id: ozonWarehouses.nsb.warehouse_id
      // },
    ]
  }).flat().map(i => {
    if (i.stock > 100) {
      i.stock = 100;
    }
    return i;
  });

  const requestsCount = Math.ceil(stocks.length / 100);
  for (let i = 0; i < requestsCount; i++) {
    const timeoutId = setTimeout(async () => {
      console.log('on it');
      const result = await axios.post('https://api-seller.ozon.ru/v2/products/stocks', {
        stocks: stocks.slice(i * 100, (i + 1) * 100),
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Client-Id': clientId,
          'Api-Key': apiKey
        }
      });
      console.log(result.data)
      console.log(i === requestsCount - 1 ? 'DONE' : `not done ${i} of ${requestsCount - 1}`);
      io.emit('ozonUpdate', result.data);
      return result.data;
    }, i * 126000);
    intervalId.push(timeoutId);
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

async function matchBothSidesTarbok(ozonList) {
  const result = [];
  const excelList = getExcelSheet();
  for (const resultElement of excelList.filter(i => i['Артикул'])) {
    const ltmBuyArt = ozonList.find(i => i.offer_id === resultElement['Артикул']);
    if (ltmBuyArt) {
      result.push({
        ozon: ltmBuyArt,
        tarbok: resultElement,
      });
    }
  }
  return result;
}

app.get('/api/ozon-list/1', async (req, res) => {
  const ozonList = await getOzonList();
  res.send(ozonList);
});

app.get('/api/ozon-list/2', async (req, res) => {
  const ozonList = await getOzonList({ clientId: OZON_MUSIC_SHOP_CLIENT_ID, apiKey: OZON_MUSIC_SHOP_API_KEY });
  res.send(ozonList);
});

app.post('/api/update/ltm', async (req, res) => {
  const {ozonList} = req.body;
  const bothSidesArray = await matchBothSides(ozonList);
  console.log(bothSidesArray)
  debugger;
  // const ozonWarehouses = await getOzonWarehouses();
  // res.send(await postStocks(ozonWarehouses, bothSidesArray));
});

app.post('/api/excel/read', (req, res) => {
  res.send(getExcelSheet())
});

app.post('/api/update/tarbok', async (req, res) => {
  const {ozonList} = req.body;
  const bothSidesArray = await matchBothSidesTarbok(ozonList);
  const ozonWarehouses = await getOzonWarehouses({ clientId: OZON_MUSIC_SHOP_CLIENT_ID, apiKey: OZON_MUSIC_SHOP_API_KEY });
  res.send(await postStocks(ozonWarehouses, bothSidesArray, {
    getStocks: (item) => +item.tarbok['Доступное количество'],
    getWarehouse: (ozonWarehouses) => ozonWarehouses.balashiha.warehouse_id,
    clientId: OZON_MUSIC_SHOP_CLIENT_ID,
    apiKey: OZON_MUSIC_SHOP_API_KEY
  }));
})

async function getDynaItem(ozonId): Promise<DynaItemResponse> {
  return (await axios.get(`https://apidnt.ru/v2/product/list?product_id=DNT_${ozonId}&key=${DYNATON_API_KEY}`)).data;
}

async function getDynaList(ozonItems) {
  const list = [];
  const ozonItemsThatsDyna = ozonItems.filter(i => i.offer_id.length === 5);
  for (const item of ozonItemsThatsDyna) {
    const dynaItem = await getDynaItem(item.offer_id);
    if (dynaItem.result === 'OK') {
      io.emit('dynaGet', dynaItem.product[0]);
      console.log(dynaItem.product[0].product_id, ' успешно получен из Динатона');
      list.push({
        dyna: dynaItem.product[0],
        ozon: item,
      });
    } else {
      console.log('Ошибка для', dynaItem.result)
    }
  }
  return list;
}

app.post('/api/update/apidnt', async (req, res) => {
  // const categories = await fetchOzonCategories();
  // const dynaCat = await findOzonCategory(categories, items.product[0]);
  // const items = await fetchDynatoneItems();
  // const postedItems = await postOzonItems(items.product);
  const {ozonList} = req.body;
  const dynaList = await getDynaList(ozonList);
  const ozonWarehouses = await getOzonWarehouses();
  res.send(postStocks(ozonWarehouses, dynaList, {
    getWarehouse: (ozonWarehouses) => ozonWarehouses.dynaton.warehouse_id,
    getStocks: (i) => i.dyna.stock_express,
  }));
});

function updatePrice(dynaList) {
  const prices = dynaList.map(i => ({
    offer_id: i.ozon.offer_id,
    price: i.dyna.price_marketplace.toString(),
    old_price: (i.dyna.price_marketplace + (i.dyna.price_marketplace * 0.05)).toString()
  }));
  const requestsCount = Math.ceil(prices.length / 100);
  for (let i = 0; i < requestsCount; i++) {
    const timeoutId = setTimeout(async () => {
      console.log('on it');
      const result = await axios.post('https://api-seller.ozon.ru/v1/product/import/prices', {
        prices: prices.slice(i * 100, (i + 1) * 100),
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Client-Id': OZON_OFFER_SHOP_CLIENT_ID,
          'Api-Key': OZON_OFFER_SHOP_API_KEY
        }
      });
      console.log(result.data);
      const errors = result.data.result.map(i => i.errors).filter(i => i.length > 0);
      if (errors.length > 0) {
        console.log('Ошибки', errors);
        io.emit('ozonPostError', {errors: errors});
      }
      console.log(i === requestsCount - 1 ? 'DONE' : `not done ${i} of ${requestsCount - 1}`);
      io.emit('ozonUpdate', result.data);
      return result.data;
    }, i * 126000);
    intervalId.push(timeoutId);
  }
}

function updatePriceTarbok(tarbokList, {
  clientId = OZON_OFFER_SHOP_CLIENT_ID,
  apiKey = OZON_OFFER_SHOP_API_KEY
}) {
  const prices = tarbokList.map(i => {
    const priceParsed = +i.tarbok['Розничная цена'].replaceAll(' ', '').split('.')[0].replace(/\D/g, '');
    return {
      offer_id: i.ozon.offer_id,
      price: (priceParsed + (priceParsed * 0.1)).toString(),
      old_price: (priceParsed + (priceParsed * 0.16)).toString(),
    };
  });
  const requestsCount = Math.ceil(prices.length / 100);
  for (let i = 0; i < requestsCount; i++) {
    const timeoutId = setTimeout(async () => {
      console.log('on it');
      const result = await axios.post('https://api-seller.ozon.ru/v1/product/import/prices', {
        prices: prices.slice(i * 100, (i + 1) * 100),
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Client-Id': clientId,
          'Api-Key': apiKey
        }
      });
      console.log(result.data);
      const errors = result.data.result.map(i => i.errors).filter(i => i.length > 0);
      if (errors.length > 0) {
        console.log('Ошибки', errors);
        io.emit('ozonPostError', {errors: errors});
      }
      console.log(i === requestsCount - 1 ? 'DONE' : `not done ${i} of ${requestsCount - 1}`);
      io.emit('ozonUpdate', result.data);
      return result.data;
    }, i * 126000);
    intervalId.push(timeoutId);
  }
}

app.post('/api/update/price/apidnt', async (req, res) => {
  const {ozonList} = req.body;
  const dynaList = await getDynaList(ozonList);
  res.send(updatePrice(dynaList));
  // res.send(postStocks(ozonWarehouses, dynaList, {
  //   getWarehouse: (ozonWarehouses) => ozonWarehouses.dynaton.warehouse_id,
  //   getStocks: (i) => i.dyna.stock_express,
  // }));
});

app.post('/api/update/price/tarbok', async (req, res) => {
  const {ozonList} = req.body;
  const bothSidesArray = await matchBothSidesTarbok(ozonList);
  res.send(updatePriceTarbok(bothSidesArray, { apiKey: OZON_MUSIC_SHOP_API_KEY, clientId: OZON_MUSIC_SHOP_CLIENT_ID }));
  // res.send(postStocks(ozonWarehouses, dynaList, {
  //   getWarehouse: (ozonWarehouses) => ozonWarehouses.dynaton.warehouse_id,
  //   getStocks: (i) => i.dyna.stock_express,
  // }));
});


app.get('*', (req, res) => {
  res.header(
    'Content-Type', 'text/html',
  )
  res.sendFile(path.join(__dirname, 'index.html'));
});

console.log('listening on port 3001');
server.listen(3001);
