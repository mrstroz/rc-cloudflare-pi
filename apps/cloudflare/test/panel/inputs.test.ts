import { describe, expect, it } from "vitest";
import { WheelInputs } from "../../src/panel/core/inputs";

describe("WheelInputs (04 §1)", () => {
  it("maps W/S to the left wheel and ↑/↓ to the right, ±1", () => {
    const inputs = new WheelInputs();
    inputs.pressKey("KeyW");
    inputs.pressKey("ArrowDown");
    expect(inputs.wheels).toEqual({ left: 1, right: -1 });
  });

  it("ignores other keys", () => {
    const inputs = new WheelInputs();
    expect(inputs.pressKey("KeyA")).toBe(false);
    expect(inputs.neutral).toBe(true);
  });

  it("opposite keys on one wheel cancel out", () => {
    const inputs = new WheelInputs();
    inputs.pressKey("KeyW");
    inputs.pressKey("KeyS");
    expect(inputs.wheel("left")).toBe(0);
  });

  it("a held key overrides the slider of its wheel, release returns to the slider", () => {
    const inputs = new WheelInputs();
    inputs.setSlider("right", 30);
    inputs.pressKey("ArrowUp");
    expect(inputs.wheel("right")).toBe(1);
    inputs.releaseKey("ArrowUp");
    expect(inputs.wheel("right")).toBe(0.3);
  });

  it("clamps the slider to -100…100 % and treats non-numbers as zero", () => {
    const inputs = new WheelInputs();
    inputs.setSlider("left", 150);
    expect(inputs.wheel("left")).toBe(1);
    inputs.setSlider("left", -150);
    expect(inputs.wheel("left")).toBe(-1);
    inputs.setSlider("left", Number.NaN);
    expect(inputs.wheel("left")).toBe(0);
  });

  it("zeroAll clears sliders and held keys", () => {
    const inputs = new WheelInputs();
    inputs.setSlider("left", 50);
    inputs.pressKey("ArrowUp");
    inputs.zeroAll();
    expect(inputs.neutral).toBe(true);
  });
});
