<script setup lang="ts">
import { reactive } from "vue";
import DrivePanel from "./DrivePanel.vue";
import { WheelInputs } from "./inputs";

// reactive() drops the private members from the type; the instance keeps them.
const inputs = reactive(new WheelInputs()) as WheelInputs;
</script>

<template>
  <main>
    <h1>RC</h1>
    <DrivePanel :inputs="inputs" />
  </main>
</template>
