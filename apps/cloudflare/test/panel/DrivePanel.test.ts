import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { reactive } from "vue";
import DrivePanel from "../../src/panel/DrivePanel.vue";
import { WheelInputs } from "../../src/panel/core/inputs";

function setup() {
  const inputs = reactive(new WheelInputs()) as WheelInputs;
  const wrapper = mount(DrivePanel, { props: { inputs }, attachTo: document.body });
  return { inputs, wrapper };
}

function drive(inputs: WheelInputs): void {
  inputs.setSlider("left", 60);
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp" }));
  expect(inputs.wheels).toEqual({ left: 0.6, right: 1 });
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  setVisibility("visible");
  document.body.innerHTML = "";
});

describe("DrivePanel zeroing (04 §2)", () => {
  it("zeroes both wheels and asks for stop when the tab is hidden", () => {
    const { inputs, wrapper } = setup();
    drive(inputs);
    setVisibility("hidden");
    expect(inputs.wheels).toEqual({ left: 0, right: 0 });
    expect(wrapper.emitted("stop")).toHaveLength(1);
  });

  it("zeroes both wheels and asks for stop when the window loses focus", () => {
    const { inputs, wrapper } = setup();
    drive(inputs);
    window.dispatchEvent(new FocusEvent("blur"));
    expect(inputs.wheels).toEqual({ left: 0, right: 0 });
    expect(wrapper.emitted("stop")).toHaveLength(1);
  });

  it("zeroes both wheels and asks for stop on a cancelled touch gesture", async () => {
    const { inputs, wrapper } = setup();
    drive(inputs);
    await wrapper.find('input[aria-label^="Lewe"]').trigger("pointercancel");
    expect(inputs.wheels).toEqual({ left: 0, right: 0 });
    expect(wrapper.emitted("stop")).toHaveLength(1);
  });

  it("asks for stop on the STOP button", async () => {
    const { inputs, wrapper } = setup();
    drive(inputs);
    await wrapper.find("button.stop").trigger("click");
    expect(inputs.neutral).toBe(true);
    expect(wrapper.emitted("stop")).toHaveLength(1);
  });

  it("zeroes only the released wheel and sends no stop", async () => {
    const { inputs, wrapper } = setup();
    drive(inputs);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowUp" }));
    expect(inputs.wheels).toEqual({ left: 0.6, right: 0 });
    await wrapper.find('input[aria-label^="Lewe"]').trigger("pointerup");
    expect(inputs.wheels).toEqual({ left: 0, right: 0 });
    expect(wrapper.emitted("stop")).toBeUndefined();
  });

  it("takes slider input in percent", async () => {
    const { inputs, wrapper } = setup();
    const slider = wrapper.find('input[aria-label^="Prawe"]');
    await slider.setValue("-40");
    expect(inputs.wheels).toEqual({ left: 0, right: -0.4 });
  });

  it("keeps the keyboard from moving a focused slider; ↑ still drives the right wheel by key", () => {
    const { inputs, wrapper } = setup();
    const slider = wrapper.find('input[aria-label^="Prawe"]').element as HTMLInputElement;
    slider.focus();
    const press = (type: "keydown" | "keyup", key: string, code: string): KeyboardEvent => {
      const event = new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true });
      slider.dispatchEvent(event);
      return event;
    };
    for (const key of ["Home", "End", "PageUp", "PageDown", "ArrowLeft", "ArrowRight"]) {
      expect(press("keydown", key, key).defaultPrevented, key).toBe(true);
    }
    expect(press("keydown", "Tab", "Tab").defaultPrevented).toBe(false);

    expect(press("keydown", "ArrowUp", "ArrowUp").defaultPrevented).toBe(true);
    expect(inputs.wheels).toEqual({ left: 0, right: 1 });
    press("keyup", "ArrowUp", "ArrowUp");
    expect(inputs.wheels).toEqual({ left: 0, right: 0 });
    expect(inputs.sliderPercent("right")).toBe(0);
  });

  it("stops listening when unmounted", () => {
    const { inputs, wrapper } = setup();
    wrapper.unmount();
    inputs.setSlider("left", 50);
    window.dispatchEvent(new FocusEvent("blur"));
    expect(inputs.wheels.left).toBe(0.5);
  });
});
