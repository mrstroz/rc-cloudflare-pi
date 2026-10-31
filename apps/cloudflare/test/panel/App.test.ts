import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/panel/App.vue";
import { DRIVE_PERIOD_MS } from "../../src/panel/core/control";

/** Stands in for the browser WebSocket; the test plays the DO and the Pi. */
class FakeWebSocket extends EventTarget {
  static last: FakeWebSocket | null = null;
  bufferedAmount = 0;
  readonly sent: Record<string, unknown>[] = [];
  constructor(readonly url: string) {
    super();
    FakeWebSocket.last = this;
  }
  send(text: string): void {
    this.sent.push(JSON.parse(text) as Record<string, unknown>);
  }
  close(): void {
    this.dispatchEvent(new Event("close"));
  }
  deliver(message: object): void {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ v: 1, ...message }) }));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("arms the car, sends drive with the newest token and shows why it stopped", async () => {
  const wrapper = mount(App, { attachTo: document.body });
  const socket = FakeWebSocket.last;
  if (socket === null) {
    throw new Error("App opened no WebSocket");
  }
  expect(socket.url).toMatch(/\/ws\/panel\/car-1$/);
  socket.dispatchEvent(new Event("open"));
  socket.deliver({ type: "device_link", connected: true });
  socket.deliver({ type: "lease", state: "granted", lease_id: "r8JfA0sUo5GxN1tVqBhY6w" });
  await flushPromises();
  expect(wrapper.find('[role="status"]').text()).toContain("Gotowe");

  await wrapper.find("button:not(.stop)").trigger("click");
  const arm = socket.sent.find((m) => m.type === "arm");
  expect(arm).toBeDefined();
  socket.deliver({
    type: "armed",
    request_id: arm?.request_id,
    session_id: "kQ3v9XbT2mWc7ZyH4nPdLe",
    freshness_token: "4200.kF7FLu2kWOb_gvVlpETLkCxjMa91_w7RYdLoyLNS5Rw",
  });
  socket.deliver({
    type: "control_token",
    session_id: "kQ3v9XbT2mWc7ZyH4nPdLe",
    freshness_token: "4250.t7nkPssPxLNf4a4O89y7DQhNqVnaAenJIhSZtVN2L-8",
  });
  await flushPromises();
  expect(wrapper.find('[role="status"]').text()).toContain("Sterowanie aktywne");

  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
  vi.advanceTimersByTime(DRIVE_PERIOD_MS);
  expect(socket.sent.filter((m) => m.type === "drive").at(-1)).toMatchObject({
    freshness_token: "4250.t7nkPssPxLNf4a4O89y7DQhNqVnaAenJIhSZtVN2L-8",
    left: 1,
    right: 0,
  });

  socket.deliver({ type: "status", state: "disarmed", stop_cause: "watchdog_timeout" });
  await flushPromises();
  expect(wrapper.find('[role="status"]').text()).toContain("Zatrzymane");
  expect(wrapper.find('[role="status"]').text()).toContain("watchdog_timeout");
  wrapper.unmount();
});

it("sends stop when the STOP button is pressed", async () => {
  const wrapper = mount(App, { attachTo: document.body });
  const socket = FakeWebSocket.last;
  socket?.dispatchEvent(new Event("open"));
  socket?.deliver({ type: "lease", state: "granted", lease_id: "r8JfA0sUo5GxN1tVqBhY6w" });
  await flushPromises();
  await wrapper.find("button.stop").trigger("click");
  expect(socket?.sent.at(-1)).toMatchObject({ type: "stop" });
  wrapper.unmount();
});

describe("pending activation (04 §3, RC-42)", () => {
  async function pendingArm() {
    const wrapper = mount(App, { attachTo: document.body });
    const socket = FakeWebSocket.last;
    if (socket === null) {
      throw new Error("App opened no WebSocket");
    }
    socket.dispatchEvent(new Event("open"));
    socket.deliver({ type: "device_link", connected: true });
    socket.deliver({ type: "lease", state: "granted", lease_id: "r8JfA0sUo5GxN1tVqBhY6w" });
    await flushPromises();
    await wrapper.find("button:not(.stop)").trigger("click");
    const arm = socket.sent.find((m) => m.type === "arm");
    if (arm === undefined) {
      throw new Error("no arm sent");
    }
    return { wrapper, socket, requestId: arm.request_id };
  }

  function armedFor(socket: FakeWebSocket, requestId: unknown): void {
    socket.deliver({
      type: "armed",
      request_id: requestId,
      session_id: "kQ3v9XbT2mWc7ZyH4nPdLe",
      freshness_token: "4200.kF7FLu2kWOb_gvVlpETLkCxjMa91_w7RYdLoyLNS5Rw",
    });
  }

  it.each([
    [
      "STOP",
      async (w: Awaited<ReturnType<typeof pendingArm>>["wrapper"]) =>
        w.find("button.stop").trigger("click"),
    ],
    [
      "a hidden tab",
      () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      },
    ],
    [
      "lost focus",
      () => {
        window.dispatchEvent(new FocusEvent("blur"));
      },
    ],
  ])("ignores armed that arrives after %s cancelled the activation", async (_name, cancel) => {
    const { wrapper, socket, requestId } = await pendingArm();
    await cancel(wrapper);
    expect(socket.sent.at(-1)).toMatchObject({ type: "stop" });

    armedFor(socket, requestId);
    await flushPromises();
    vi.advanceTimersByTime(DRIVE_PERIOD_MS * 4);
    expect(wrapper.find('[role="status"]').text()).toContain("Gotowe");
    expect(socket.sent.filter((m) => m.type === "drive")).toEqual([]);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    wrapper.unmount();
  });

  it("ignores armed with another request_id", async () => {
    const { wrapper, socket } = await pendingArm();
    armedFor(socket, "AAAAAAAAAAAAAAAAAAAAAA");
    await flushPromises();
    vi.advanceTimersByTime(DRIVE_PERIOD_MS * 4);
    expect(wrapper.find('[role="status"]').text()).toContain("Gotowe");
    expect(wrapper.find('[role="status"]').text()).toContain("aktywacja oczekuje");
    expect(socket.sent.filter((m) => m.type === "drive")).toEqual([]);
    wrapper.unmount();
  });

  it("cancels the activation when the lease is lost; the DO sends the stop", async () => {
    const { wrapper, socket, requestId } = await pendingArm();
    socket.deliver({ type: "lease", state: "lost", reason: "taken_over" });
    armedFor(socket, requestId);
    await flushPromises();
    vi.advanceTimersByTime(DRIVE_PERIOD_MS * 4);
    expect(socket.sent.filter((m) => m.type === "drive" || m.type === "stop")).toEqual([]);
    wrapper.unmount();
  });
});
