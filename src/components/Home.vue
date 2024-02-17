<script setup lang="ts">
import {ref} from "vue";

const ozonItems = ref([]);
</script>

<template>
  <div class="p-2" v-cloak>
    <div class="flex justify-content-between align-items-center">
      <Button icon="pi pi-cloud-upload" label="Обновить остатки"></Button>
    </div>
  </div>
</template>

<style scoped>
[v-cloak] {
  display: none;
}
</style>