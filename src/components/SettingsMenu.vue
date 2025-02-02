<script setup lang="ts">
import {ref} from "vue";

const popover = ref();
const toggle = (event) => {
  popover.value.toggle(event);
}

defineProps<{
  percentLtm: number,
}>();

defineEmits<{
  (e: 'update:percent-ltm', value: number): void
}>();
</script>

<template>
  <div class="card flex justify-center">
    <Button type="button" icon="pi pi-cog" label="Настройки" @click="toggle" />
    <Popover ref="popover">
    <div class="flex flex-col">
      <div>
        <span class="font-medium block mb-2">Процент к цене для LTM</span>
        <InputNumber
            :model-value="percentLtm" @update:model-value="$emit('update:percent-ltm', $event)"
            suffix=" %" mode="decimal"
            :min="1"
            :max="100"
        />
      </div>
    </div>
  </Popover>
  </div>
</template>
