<script setup lang="ts">
import {computed, inject, ref} from "vue";
import axios from "axios";

const apiUrl = inject('apiUrl');
const ozonItems = ref([]);

async function getOzonList() {
  ozonItems.value = (await axios.get(`${apiUrl}/ozon-list`)).data;
}

async function updateOzonList() {
  ozonItems.value = (await axios.get(`${apiUrl}/ozon-update`)).data;
}

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
</script>

<template>
  <div class="p-2" v-cloak>
    <div class="flex justify-content-between align-items-center">
      <Button icon="pi pi-cloud-download" label="Получить список товаров" @click="getOzonList"></Button>
      <Button icon="pi pi-cloud-upload" label="Обновить остатки"></Button>
    </div>
    <div class="mt-3">
      <DataTable :value="ozonItems" selectionMode="single" paginator
                 :rows="10" :rowsPerPageOptions="rowsPerPage"
                 removableSort showGridlines filterDisplay="row">
        <Column v-for="[k,{header, field}] in Object.entries(columns)" :header="header" :field="field" sortable
                :key="k">
          <!--        <template #body="{data}">-->
          <!--          {{ data }}-->
          <!--        </template>-->
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style>
[v-cloak] {
  display: none;
}
</style>