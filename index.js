const express = require('express');
const cors = require("cors");
const app = express();
const {writeFileSync, readFileSync} = require("fs");
const fs = require('fs');
const axios = require('axios');

const OZON_API_KEY = '13151367-37ca-4475-be2e-9734ed77969d';
const OZON_CLIENT_ID = '1677349';

const LTM_API_KEY = 'i47Of3FdUm9RaV8DB232';

app.use(cors());
app.use(express.static('dist'));
app.use(express.json());

const ltmItems = async (page) => await axios.get(`https://ltm-music.ru/api/product/?limit=500&page=${page}`, {
  headers: {
    Authorization: LTM_API_KEY
  }
});

async function getLtmList() {
  const { data: listFirst } = await ltmItems(1);
  const pages = listFirst.page_count;
  const list = [...listFirst.products];
  for (let i = 2; i <= pages; i++) {
    const newList = await ltmItems(i);
    list.push(...newList)
  }
  return list;
}

async function findLtmBuyArt(art, list){
  for (const item of list) {
    for (const offer of item.offers) {
      if(offer.bar_code == art){
        return offer;
      }

    }
  }
  // return list.find(el => el.offers.find(offer => offer.bar_code == art));
}

async function getOzonList(){
  const ozonList = await axios.post('https://api-seller.ozon.ru/v2/product/list',{
    limit: 9999
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Client-Id': OZON_CLIENT_ID,
      'Api-Key': OZON_API_KEY
    },
  });
  return ozonList.data.result.items;
}

async function getOzonWarehouses(){
//   POST https://api-seller.ozon.ru/v1/warehouse/list
// Content-Type: application/json
// Client-Id: 1677349
// Api-Key:13151367-37ca-4475-be2e-9734ed77969d
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

async function postStocks(ozonWarehouses, bothSidesArray){
  // POST https://api-seller.ozon.ru/v2/products/stocks
  // Content-Type: application/json
  // Client-Id: 1677349
  // Api-Key:13151367-37ca-4475-be2e-9734ed77969d
  // "stocks": [
  //   {
  //     "offer_id": "425188",
  //     "product_id": 866646461,
  //     "stock": 0,
  //     "warehouse_id": 1020001325880000
  //   }
  // ]
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
    if(i.stock > 100){
      i.stock = 100;
    }
    return i;
  }).filter(i => i.stock > 0);
  // const result = await axios.post('https://api-seller.ozon.ru/v2/products/stocks', {
  //   stocks: stocks.slice(0, 100),
  // }, {
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'Client-Id': OZON_CLIENT_ID,
  //     'Api-Key': OZON_API_KEY
  //   }
  // });
  // return result.data;
}

async function matchBothSides(ozonList){
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
  console.log(JSON.stringify(result))
  return result;
}

app.get('/', async (req, res) => {
  // const ltmList = await findLtmBuyArt(522070);
  const ozonList = await getOzonList();
  const bothSidesArray = await matchBothSides(ozonList);
  const ozonWarehouses = await getOzonWarehouses();
  res.send(await postStocks(ozonWarehouses, bothSidesArray));
})

console.log('listening on port 3001');
app.listen(3001);
