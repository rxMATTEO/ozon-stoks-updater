<script setup lang="ts">
import Home from "./components/Home.vue";
import {provide} from "vue";

provide('apiUrl', 'http://localhost:3001/api');
</script>

<template>
  <Home />
</template>

<style scoped>
</style>
