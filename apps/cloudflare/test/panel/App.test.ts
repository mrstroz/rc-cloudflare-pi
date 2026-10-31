import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
