<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef } from "vue";
import { carIdFromLocation, connectPanel, panelSocketUrl } from "./connection";
import type { DriveControl, PanelStatus } from "./core/control";
import DrivePanel from "./DrivePanel.vue";
import { WheelInputs } from "./core/inputs";

// reactive() drops the private members from the type; the instance keeps them.
const inputs = reactive(new WheelInputs()) as WheelInputs;
const control = shallowRef<DriveControl | null>(null);

const STATUS_TEXT: Record<PanelStatus, string> = {
  offline: "Auto offline",
  busy: "Zajęte",
  ready: "Gotowe",
  active: "Sterowanie aktywne",
  stopped: "Zatrzymane",
  error: "Błąd",
};

const disconnect = connectPanel(
  panelSocketUrl(window.location, carIdFromLocation(window.location)),
  () => inputs.wheels,
  (next) => {
    control.value = next === null ? null : (reactive(next) as DriveControl);
    return control.value;
  },
);
// Re-evaluates the telemetry age a few times a second (04 §5).
const now = ref(performance.now());
const ticker = setInterval(() => {
  now.value = performance.now();
}, 250);
onBeforeUnmount(() => {
  clearInterval(ticker);
  disconnect();
});

const telemetryAge = computed(() => {
  const at = control.value?.lastStatusAt ?? null;
  return at === null ? null : Math.max(0, Math.round(now.value - at));
});

const status = computed(() => (control.value === null ? null : control.value.status));
const detail = computed(() => {
  const current = control.value;
  if (current === null) {
    return null;
  }
  if (current.status === "stopped") {
    return current.stopCause;
  }
  if (current.status === "error") {
    return current.error;
  }
  return current.pendingArm === null ? null : "aktywacja oczekuje";
});
</script>

<template>
  <main>
    <header>
      <p class="link">Połączenie: {{ control === null ? "rozłączone, ponawiam" : "otwarte" }}</p>
      <p class="rtt">
        Obieg:
        {{
          control?.roundTrip == null
            ? "brak pomiaru"
            : `${String(Math.round(control.roundTrip.ms))} ms (${control.roundTrip.source})`
        }}
      </p>
      <p class="telemetry">
        Telemetria auta: {{ telemetryAge === null ? "brak" : `${String(telemetryAge)} ms temu` }}
      </p>
      <p class="status" role="status">
        {{ status === null ? "—" : STATUS_TEXT[status] }}
        <span v-if="detail !== null" class="detail">({{ detail }})</span>
      </p>
    </header>
    <div class="actions">
      <button type="button" :disabled="!control?.canArm" @click="control?.arm()">
        Aktywuj sterowanie
      </button>
      <button v-if="control?.canTakeOver" type="button" @click="control.takeOver()">
        Przejmij
      </button>
    </div>
    <DrivePanel :inputs="inputs" @stop="control?.stop()" />
  </main>
</template>
