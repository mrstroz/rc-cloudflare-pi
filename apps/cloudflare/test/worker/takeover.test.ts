import { describe, expect, it } from "vitest";
import { Car, type Peer } from "./peers";

const ARM = { type: "arm", request_id: "Zm9vYmFyYmF6cXV4MTIzNA" };

/** Pi connected, `owner` holding the lease, `taker` connected and told the lease is busy. */
async function contested(): Promise<{ device: Peer; owner: Peer; taker: Peer }> {
  const car = new Car();
  const device = await car.device();
  const owner = await car.panel();
  owner.send({ type: "hello" });
  await owner.next(); // device_link
  const stop = await device.next();
  device.send({ type: "stopped", request_id: stop.request_id, cause: null });
  expect(await owner.next()).toMatchObject({ type: "lease", state: "granted" });
  const taker = await car.panel();
  taker.send({ type: "hello" });
  await taker.next(); // device_link
  expect(await taker.next()).toEqual({ v: 1, type: "lease", state: "busy" });
  return { device, owner, taker };
}

describe("takeover in the DO", () => {
  it("takes the lease over after the Pi confirms the stop", async () => {
    const { device, owner, taker } = await contested();
    taker.send({ type: "takeover" });
    expect(await owner.next()).toEqual({
      v: 1,
      type: "lease",
      state: "lost",
      reason: "taken_over",
    });
    const stop = await device.next();
    expect(stop).toMatchObject({ type: "stop" });

    device.send({ type: "stopped", request_id: stop.request_id, cause: "stop_command" });
    expect(await taker.next()).toEqual({
      v: 1,
      type: "lease",
      state: "granted",
      lease_id: stop.lease_id,
    });
    owner.send(ARM);
    expect(await owner.next()).toMatchObject({ type: "error", reason: "lease_mismatch" });
  });

  it("leaves nobody with the lease without stopped within 2 s", async () => {
    const { device, owner, taker } = await contested();
    taker.send({ type: "takeover" });
    expect(await owner.next()).toMatchObject({ type: "lease", state: "lost" });
    await device.next();

    expect(await taker.next(2500)).toEqual({
      v: 1,
      type: "error",
      reason: "stop_unconfirmed",
      request_id: null,
    });
    for (const tab of [owner, taker]) {
      expect(await tab.next()).toEqual({ v: 1, type: "lease", state: "free" });
      tab.send(ARM);
      expect(await tab.next()).toMatchObject({ type: "error", reason: "lease_mismatch" });
    }
    expect(await device.silentFor(100)).toBe(true);
  });

  it("answers a second takeover during the first with error", async () => {
    const { device, owner, taker } = await contested();
    taker.send({ type: "takeover" });
    await owner.next();
    const stop = await device.next();

    owner.send({ type: "takeover" });
    expect(await owner.next()).toEqual({
      v: 1,
      type: "error",
      reason: "takeover_in_progress",
      request_id: null,
    });
    expect(await device.silentFor(100)).toBe(true);

    device.send({ type: "stopped", request_id: stop.request_id, cause: null });
    expect(await taker.next()).toMatchObject({ type: "lease", state: "granted" });
  });
});
