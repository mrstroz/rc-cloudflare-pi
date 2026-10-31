<script setup lang="ts">
import type { Wheel, WheelInputs } from "./inputs";

const props = defineProps<{ inputs: WheelInputs; wheel: Wheel; label: string }>();
const emit = defineEmits<{ cancel: [] }>();

function onInput(event: Event): void {
  props.inputs.setSlider(props.wheel, Number((event.target as HTMLInputElement).value));
}

function onRelease(): void {
  props.inputs.releaseSlider(props.wheel);
}
</script>

<template>
  <label class="wheel">
    <span>{{ label }}</span>
    <input
      type="range"
      min="-100"
      max="100"
      step="1"
      :value="inputs.sliderPercent(wheel)"
      :aria-label="label"
      @input="onInput"
      @pointerup="onRelease"
      @touchend="onRelease"
      @pointercancel="emit('cancel')"
      @touchcancel="emit('cancel')"
    />
    <output>{{ Math.round(inputs.wheel(wheel) * 100) }}%</output>
  </label>
</template>

<style scoped>
.wheel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
input[type="range"] {
  writing-mode: vertical-lr;
  direction: rtl;
  height: 16rem;
  touch-action: none;
}
</style>
