<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import type { WheelInputs } from "./inputs";
import WheelSlider from "./WheelSlider.vue";

/**
 * Inputs and zeroing of docs/spec/04 §1–§2. Everything that zeroes both wheels also asks for
 * `stop`; what `stop` does on the wire belongs to the caller.
 */
const props = defineProps<{ inputs: WheelInputs }>();
const emit = defineEmits<{ stop: [] }>();

function stopAll(): void {
  props.inputs.zeroAll();
  emit("stop");
}

function onKeyDown(event: KeyboardEvent): void {
  if (props.inputs.pressKey(event.code)) {
    event.preventDefault();
  }
}

function onKeyUp(event: KeyboardEvent): void {
  props.inputs.releaseKey(event.code);
}

function onVisibilityChange(): void {
  if (document.visibilityState === "hidden") {
    stopAll();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", stopAll);
  document.addEventListener("visibilitychange", onVisibilityChange);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("blur", stopAll);
  document.removeEventListener("visibilitychange", onVisibilityChange);
});
</script>

<template>
  <section class="drive">
    <WheelSlider :inputs="inputs" wheel="left" label="Lewe koło (W/S)" @cancel="stopAll" />
    <button type="button" class="stop" @click="stopAll">STOP</button>
    <WheelSlider :inputs="inputs" wheel="right" label="Prawe koło (↑/↓)" @cancel="stopAll" />
  </section>
</template>

<style scoped>
.drive {
  display: flex;
  justify-content: space-around;
  align-items: center;
  gap: 1rem;
}
.stop {
  width: 8rem;
  height: 8rem;
  border-radius: 50%;
  border: none;
  background: #c62828;
  color: #fff;
  font-size: 1.5rem;
  font-weight: 700;
}
</style>
