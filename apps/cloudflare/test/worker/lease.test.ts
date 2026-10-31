import { describe, expect, it } from "vitest";
import { Car } from "./peers";

const ID = /^[A-Za-z0-9_-]{22}$/;

describe("lease in the DO", () => {
  it("is granted on hello at once while the Pi is offline", async () => {
    const tab = await new Car().panel();
    tab.send({ type: "hello" });
    expect(await tab.next()).toMatchObject({
      type: "lease",
      state: "granted",
      lease_id: expect.stringMatching(ID),
    });
  });

  it("is granted on hello only after stopped for the DO's own stop", async () => {
    const car = new Car();
    const device = await car.device();
    const tab = await car.panel();
    tab.send({ type: "hello" });

    const stop = await device.next();
    expect(stop).toMatchObject({
      type: "stop",
      request_id: expect.stringMatching(ID),
      lease_id: expect.stringMatching(ID),
    });
    device.send({ type: "stopped", request_id: "e5HsW0uJ3Fg8NaCyOzXb1Q", cause: null });
    expect(await tab.silentFor(100)).toBe(true);

    device.send({ type: "stopped", request_id: stop.request_id, cause: null });
    expect(await tab.next()).toEqual({
      v: 1,
      type: "lease",
      state: "granted",
      lease_id: stop.lease_id,
    });
  });

  it("fails after 2 s without stopped: error to the tab, nobody holds the lease", async () => {
    const car = new Car();
    const device = await car.device();
    const tab = await car.panel();
    tab.send({ type: "hello" });
    const stop = await device.next();

    expect(await tab.next(2500)).toEqual({
      v: 1,
      type: "error",
      reason: "stop_unconfirmed",
      request_id: null,
    });
    device.send({ type: "stopped", request_id: stop.request_id, cause: null });
    tab.send({ type: "arm", request_id: "Zm9vYmFyYmF6cXV4MTIzNA" });
    expect(await tab.next()).toMatchObject({ type: "error", reason: "lease_mismatch" });
  });

  it("tells a second tab the lease is busy", async () => {
    const car = new Car();
    const first = await car.panel();
    const second = await car.panel();
    first.send({ type: "hello" });
    await first.next();
    second.send({ type: "hello" });
    expect(await second.next()).toEqual({ v: 1, type: "lease", state: "busy" });
    second.send({ type: "arm", request_id: "Zm9vYmFyYmF6cXV4MTIzNA" });
    expect(await second.next()).toMatchObject({ type: "error", reason: "lease_mismatch" });
  });

  it("expires 3 s after the last heartbeat: lost, free and stop", async () => {
    const car = new Car();
    const device = await car.device();
    const owner = await car.panel();
    const other = await car.panel();
    owner.send({ type: "hello" });
    const grantStop = await device.next();
    device.send({ type: "stopped", request_id: grantStop.request_id, cause: null });
    const granted = await owner.next();

    await new Promise((resolve) => setTimeout(resolve, 1000));
    owner.send({ type: "heartbeat", heartbeat_seq: 1 });
    expect(await owner.silentFor(2800)).toBe(true);

    expect(await owner.next(500)).toEqual({
      v: 1,
      type: "lease",
      state: "lost",
      reason: "expired",
    });
    expect(await other.next()).toEqual({ v: 1, type: "lease", state: "free" });
    expect(await device.next()).toMatchObject({ type: "stop", lease_id: granted.lease_id });

    owner.send({ type: "arm", request_id: "Zm9vYmFyYmF6cXV4MTIzNA" });
    expect(await owner.next()).toMatchObject({ type: "error", reason: "lease_mismatch" });
  }, 10_000);

  it("frees the lease when the owner closes: free to the others, stop to the Pi", async () => {
    const car = new Car();
    const owner = await car.panel();
    const other = await car.panel();
    owner.send({ type: "hello" });
    await owner.next();
    const device = await car.device();
    owner.close();
    expect(await other.next()).toEqual({ v: 1, type: "lease", state: "free" });
    expect(await device.next()).toMatchObject({ type: "stop" });
  });
});
