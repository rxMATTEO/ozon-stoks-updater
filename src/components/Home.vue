<script setup lang="ts">
import {computed, inject, ref} from "vue";
import axios from "axios";
import {Socket, io} from "socket.io-client";
import {useToast} from "primevue/usetoast";
import {FilterMatchMode} from "primevue/api";

const toast = useToast();

const apiUrl = inject('apiUrl');
const ozonItems = ref([]);
const updatedOzonItems = ref([]);

async function getOzonList() {
  ozonItems.value = (await axios.get(`${apiUrl}/ozon-list`)).data;
}

async function updateLtmList() {
  return (await axios.post(`${apiUrl}/update/ltm`, {
    ozonList: ozonItems.value
  })).data;
}

async function updateDynatonList() {
  return (await axios.post(`${apiUrl}/update/apidnt`, {
    ozonList: ozonItems.value
  })).data;
}

async function updateDynatonPrices() {
  return (await axios.post(`${apiUrl}/update/price/apidnt`, {
    ozonList: ozonItems.value
  })).data;
}

const socket: Socket = io('http://localhost:3001');
socket.emit('connection');
socket.on('ozonUpdate', ({result}) => {
  updatedOzonItems.value.push(...result);
  toast.add({severity: 'success', summary: 'Успех!', detail: `Обновлено ${result.length} записей`});
});

socket.on('dynaGet', ({product_id, stock_express, price_marketplace}) => {
  toast.add({
    severity: 'success',
    summary: 'Успех!',
    detail: `Товар ${product_id} в количестве ${stock_express} шт., ценой ${Intl.NumberFormat('ru-RU').format(price_marketplace)} руб. успешно подтянулся из Динатона`,
    life: 3000
  });
});

socket.on('ozonPostError', ({errors}) => {
  toast.add({
    severity: 'error',
    summary: 'Ошибка!',
    detail: errors,
    life: 3000
  });
});

const columns = computed(() => {
  return {
    productId: {
      header: 'ID товара',
      field: 'product_id'
    },
    offerId: {
      header: 'Артикул',
      field: 'offer_id',
    },
  }
});

const rowsPerPage = computed(() => {
  return [10, 20, 50];
});

const filters = ref({
  global: {value: null, matchMode: FilterMatchMode.STARTS_WITH},
});

const updateStocksButtons = [
  {
    label: 'Обновить остатки LTM',
    disabled: false,
    command() {
      updateStocksButtons[0].disabled = true;
      updateLtmList().then(() => updateStocksButtons[0].disabled = false);
    }
  },
  {
    disabled: false,
    label: 'Обновить остатки Dynaton',
    command: () => {
      updateStocksButtons[1].disabled = true;
      updateDynatonList().then(() => updateStocksButtons[1].disabled = false);
    }
  },
];

const updatePriceButtons = [
  {
    label: 'Обновить цены Dynaton',
    disabled: false,
    command: () => {
      updatePriceButtons[0].disabled = true;
      updateDynatonPrices().then(() => updatePriceButtons[0].disabled = false);
    }
  },
]
</script>

<template>
  <Toast/>
  <div class="p-2" v-cloak>
    <div class="flex justify-content-between align-items-center">
      <Button icon="pi pi-cloud-download" label="Получить список товаров" @click="getOzonList"></Button>
      <div class="flex gap-3">
        <SplitButton :disabled="!ozonItems.length" severity="info" icon="pi pi-cloud-upload" label="Обновить цены у поставщика"
                     :model="updatePriceButtons"></SplitButton>
        <SplitButton :disabled="!ozonItems.length" icon="pi pi-cloud-upload" label="Обновить остатки у поставщика"
                     :model="updateStocksButtons"></SplitButton>
      </div>
    </div>
    <div class="mt-3">
      <DataTable v-model:filters="filters" :value="ozonItems" selectionMode="single" paginator
                 :rows="10" :rowsPerPageOptions="rowsPerPage" :global-filter-fields="['offer_id']"
                 removableSort showGridlines filterDisplay="row">
        <template #header>
          <div class="flex justify-content-end">
            <InputText v-model="filters['global'].value" placeholder="Поиск по артикулу"/>
          </div>
        </template>
        <Column v-for="[k,{header, field}] in Object.entries(columns)" :header="header" :field="field" sortable
                :key="k">
          <template #body="{data}">
            <div :class="{'text-green-500': updatedOzonItems.some(i => i.product_id === data.product_id)}">
              {{ data[field] }}
            </div>
          </template>
        </Column>
        <Column header="Обновлено">
          <template #body={data}>
            <div :class="{'text-green-500': updatedOzonItems.some(i => i.product_id === data.product_id)}">
              {{ updatedOzonItems.some(i => i.product_id === data.product_id) ? 'Да' : 'Нет' }}
            </div>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style>
[v-cloak] {
  display: none;
}

.p-toast {
  top: 220px !important;
}
</style>