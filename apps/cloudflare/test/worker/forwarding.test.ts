import { describe, expect, it } from "vitest";
import { Car, type Peer } from "./peers";

const DRIVE = {
  type: "drive",
  session_id: "kQ3v9XbT2mWc7ZyH4nPdLe",
  seq: 123,
  freshness_token: "4250.t7nkPssPxLNf4a4O89y7DQhNqVnaAenJIhSZtVN2L-8",
  left: 0.7,
  right: -0.7,
};
const ARMED = {
  type: "armed",
  request_id: "Zp2L9cMEd4TqYk7RxB1VnA",
  session_id: "kQ3v9XbT2mWc7ZyH4nPdLe",
  freshness_token: "4200.kF7FLu2kWOb_gvVlpETLkCxjMa91_w7RYdLoyLNS5Rw",
};

/** A car with the Pi connected and tab `driver` holding the lease. */
async function drivenCar(): Promise<{ car: Car; device: Peer; driver: Peer; leaseId: string }> {
  const car = new Car();
  const device = await car.device();
  const driver = await car.panel();
  driver.send({ type: "hello" });
  expect(await driver.next()).toEqual({ v: 1, type: "device_link", connected: true });
  const stop = await device.next();
  device.send({ type: "stopped", request_id: stop.request_id, cause: null });
  const granted = await driver.next();
  expect(granted).toMatchObject({ type: "lease", state: "granted" });
  return { car, device, driver, leaseId: granted.lease_id as string };
}

describe("forwarding to the Pi", () => {
  it("sends the driver's drive, heartbeat, arm and stop with the lease_id", async () => {
    const { device, driver, leaseId } = await drivenCar();
    driver.send(DRIVE);
    expect(await device.next()).toEqual({ v: 1, ...DRIVE, lease_id: leaseId });
    driver.send({ type: "heartbeat", heartbeat_seq: 17 });
    expect(await device.next()).toEqual({
      v: 1,
      type: "heartbeat",
      heartbeat_seq: 17,
      lease_id: leaseId,
    });
    driver.send({ type: "arm", request_id: "Zm9vYmFyYmF6cXV4MTIzNA" });
    expect(await device.next()).toEqual({
      v: 1,
      type: "arm",
      request_id: "Zm9vYmFyYmF6cXV4MTIzNA",
      lease_id: leaseId,
    });
    driver.send({ type: "stop", request_id: "e5HsW0uJ3Fg8NaCyOzXb1Q" });
    expect(await device.next()).toEqual({
      v: 1,
      type: "stop",
      request_id: "e5HsW0uJ3Fg8NaCyOzXb1Q",
      lease_id: leaseId,
    });
  });

  it("does not let drive from a tab outside the lease reach the Pi", async () => {
    const { car, device } = await drivenCar();
    const other = await car.panel();
    other.send({ type: "hello" });
    expect(await other.next()).toMatchObject({ type: "device_link" });
    expect(await other.next()).toEqual({ v: 1, type: "lease", state: "busy" });

    other.send(DRIVE);
    expect(await other.next()).toEqual({
      v: 1,
      type: "error",
      reason: "lease_mismatch",
      request_id: null,
    });
    other.send({ type: "heartbeat", heartbeat_seq: 1 });
    expect(await device.silentFor(200)).toBe(true);
  });

  it("sends stop to the Pi when the driver disconnects", async () => {
    const { device, driver, leaseId } = await drivenCar();
    driver.close();
    expect(await device.next()).toMatchObject({ type: "stop", lease_id: leaseId });
  });
});

describe("forwarding to the driver", () => {
  it("passes the Pi's answers and telemetry to the driver only", async () => {
    const { car, device, driver } = await drivenCar();
    const other = await car.panel();
    device.send(ARMED);
    expect(await driver.next()).toEqual({ v: 1, ...ARMED });
    device.send({ type: "error", reason: "lease_mismatch", request_id: null });
    expect(await driver.next()).toEqual({
      v: 1,
      type: "error",
      reason: "lease_mismatch",
      request_id: null,
    });
    expect(await other.silentFor(200)).toBe(true);
  });

  it("forwards nothing from the Pi while nobody holds the lease", async () => {
    const car = new Car();
    const device = await car.device();
    const tab = await car.panel();
    device.send(ARMED);
    expect(await tab.silentFor(200)).toBe(true);
  });
});

describe("device_link", () => {
  it("tells every tab when the Pi connects and disconnects", async () => {
    const car = new Car();
    const first = await car.panel();
    const second = await car.panel();
    const device = await car.device();
    expect(await first.next()).toEqual({ v: 1, type: "device_link", connected: true });
    expect(await second.next()).toEqual({ v: 1, type: "device_link", connected: true });
    device.close();
    expect(await first.next()).toEqual({ v: 1, type: "device_link", connected: false });
    expect(await second.next()).toEqual({ v: 1, type: "device_link", connected: false });
  });

  it("answers hello with the current state", async () => {
    const tab = await new Car().panel();
    tab.send({ type: "hello" });
    expect(await tab.next()).toEqual({ v: 1, type: "device_link", connected: false });
  });

  it("completes a pending grant when the Pi disconnects", async () => {
    const car = new Car();
    const device = await car.device();
    const tab = await car.panel();
    tab.send({ type: "hello" });
    await tab.next();
    await device.next();
    device.close();
    expect(await tab.next()).toEqual({ v: 1, type: "device_link", connected: false });
    expect(await tab.next()).toMatchObject({ type: "lease", state: "granted" });
  });
});
