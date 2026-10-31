/**
 * Wheel inputs of docs/spec/04 §1–§2: two sliders and four keys. A held key gives ±1 for its
 * wheel (00 §9, question 12); the power limit stays on the Pi. Positive is forward.
 */

export type Wheel = "left" | "right";

export interface Wheels {
  readonly left: number;
  readonly right: number;
}

const KEYS: Readonly<Record<string, { wheel: Wheel; value: 1 | -1 }>> = {
  KeyW: { wheel: "left", value: 1 },
  KeyS: { wheel: "left", value: -1 },
  ArrowUp: { wheel: "right", value: 1 },
  ArrowDown: { wheel: "right", value: -1 },
};

export function isDriveKey(code: string): boolean {
  return Object.hasOwn(KEYS, code);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

export class WheelInputs {
  private readonly slider: Record<Wheel, number> = { left: 0, right: 0 };
  private readonly held = new Set<string>();

  /** Slider position in percent, -100…100. */
  setSlider(wheel: Wheel, percent: number): void {
    this.slider[wheel] = Number.isFinite(percent) ? clamp(percent / 100) : 0;
  }

  /** A released slider springs back to zero. */
  releaseSlider(wheel: Wheel): void {
    this.slider[wheel] = 0;
  }

  /** Returns whether the key drives a wheel. */
  pressKey(code: string): boolean {
    if (!isDriveKey(code)) {
      return false;
    }
    this.held.add(code);
    return true;
  }

  /** Releasing the last key of a wheel zeroes that wheel, its slider included (04 §2). */
  releaseKey(code: string): void {
    const key = KEYS[code];
    this.held.delete(code);
    if (key !== undefined && ![...this.held].some((held) => KEYS[held]?.wheel === key.wheel)) {
      this.slider[key.wheel] = 0;
    }
  }

  zeroAll(): void {
    this.slider.left = 0;
    this.slider.right = 0;
    this.held.clear();
  }

  /** A wheel with a key held follows the keys; otherwise it follows its slider. */
  wheel(wheel: Wheel): number {
    const keys = [...this.held].map((code) => KEYS[code]).filter((key) => key?.wheel === wheel);
    if (keys.length > 0) {
      return clamp(keys.reduce((sum, key) => sum + (key?.value ?? 0), 0));
    }
    return this.slider[wheel];
  }

  get wheels(): Wheels {
    return { left: this.wheel("left"), right: this.wheel("right") };
  }

  /** Both wheels at zero: the condition for `arm` (04 §3). */
  get neutral(): boolean {
    return this.wheel("left") === 0 && this.wheel("right") === 0;
  }

  /** Slider position in percent for display, -100…100. */
  sliderPercent(wheel: Wheel): number {
    return Math.round(this.slider[wheel] * 100);
  }
}
