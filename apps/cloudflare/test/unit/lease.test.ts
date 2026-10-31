import { beforeEach, describe, expect, it } from "vitest";
import {
  DriverLease,
  LEASE_TIMEOUT_MS,
  STOP_CONFIRM_TIMEOUT_MS,
  type Effect,
} from "../../src/worker/lease";

type Tab = "A" | "B" | "C";

class TestClock {
  ms = 0;
  private ids = 0;
  now(): number {
    return this.ms;
  }
  newId(): string {
    this.ids += 1;
    return `id${String(this.ids)}`.padEnd(22, "0");
  }
}

let clock: TestClock;
let lease: DriverLease<Tab>;

beforeEach(() => {
  clock = new TestClock();
  lease = new DriverLease<Tab>(clock);
});

function stopRequestId(effects: Effect<Tab>[]): string {
  const stop = effects.find((e) => e.to === "device" && e.message.type === "stop");
  if (stop?.message.type !== "stop") {
    throw new Error("expected a stop to the device");
  }
  return stop.message.request_id;
}

describe("grant on hello", () => {
  it("grants at once when the Pi is offline", () => {
    expect(lease.hello("A", false)).toEqual([
      {
        to: "panel",
        tab: "A",
        message: { v: 1, type: "lease", state: "granted", lease_id: "id1".padEnd(22, "0") },
      },
    ]);
    expect(lease.holds("A")).toBe(true);
  });

  it("with the Pi online grants only after stopped with the DO's own request_id", () => {
    const effects = lease.hello("A", true);
    expect(effects).toEqual([
      {
        to: "device",
        message: {
          v: 1,
          type: "stop",
          request_id: "id2".padEnd(22, "0"),
          lease_id: "id1".padEnd(22, "0"),
        },
      },
    ]);
    expect(lease.holds("A")).toBe(false);

    expect(lease.stopped("someone-elses-request0")).toEqual([]);
    expect(lease.stopped(null)).toEqual([]);
    expect(lease.holds("A")).toBe(false);

    expect(lease.stopped(stopRequestId(effects))).toEqual([
      {
        to: "panel",
        tab: "A",
        message: { v: 1, type: "lease", state: "granted", lease_id: "id1".padEnd(22, "0") },
      },
    ]);
    expect(lease.holds("A")).toBe(true);
  });

  it("fails without stopped within 2 s: nobody holds the lease and the tab gets error", () => {
    const effects = lease.hello("A", true);
    clock.ms = STOP_CONFIRM_TIMEOUT_MS - 1;
    expect(lease.expire(true)).toEqual([]);
    clock.ms = STOP_CONFIRM_TIMEOUT_MS;
    expect(lease.expire(true)).toEqual([
      {
        to: "panel",
        tab: "A",
        message: { v: 1, type: "error", reason: "stop_unconfirmed", request_id: null },
      },
      { to: "others", except: null, message: { v: 1, type: "lease", state: "free" } },
    ]);
    expect(lease.stopped(stopRequestId(effects))).toEqual([]);
    expect(lease.holds("A")).toBe(false);
  });

  it("is cancelled when the requesting tab closes", () => {
    const effects = lease.hello("A", true);
    expect(lease.gone("A", true)).toEqual([
      { to: "others", except: "A", message: { v: 1, type: "lease", state: "free" } },
    ]);
    expect(lease.stopped(stopRequestId(effects))).toEqual([]);
    expect(lease.holds("A")).toBe(false);
  });

  it("is not inherited by another tab when it fails", () => {
    lease.hello("A", true);
    expect(lease.hello("B", true)).toEqual([
      { to: "panel", tab: "B", message: { v: 1, type: "lease", state: "busy" } },
    ]);
    clock.ms = STOP_CONFIRM_TIMEOUT_MS;
    lease.expire(true);
    expect(lease.holds("B")).toBe(false);
  });
});

describe("second tab", () => {
  it("gets busy while the lease is held", () => {
    lease.hello("A", false);
    expect(lease.hello("B", false)).toEqual([
      { to: "panel", tab: "B", message: { v: 1, type: "lease", state: "busy" } },
    ]);
    expect(lease.holds("B")).toBe(false);
    expect(lease.holds("A")).toBe(true);
  });

  it("gets busy while a grant is pending", () => {
    lease.hello("A", true);
    expect(lease.hello("B", true)).toEqual([
      { to: "panel", tab: "B", message: { v: 1, type: "lease", state: "busy" } },
    ]);
  });

  it("does not inherit a lease freed by the owner closing", () => {
    lease.hello("A", false);
    lease.gone("A", false);
    expect(lease.holds("B")).toBe(false);
  });
});

describe("expiry", () => {
  it("expires 3 s after the last renewal: lost to the owner, free to the rest, stop to the Pi", () => {
    lease.hello("A", false);
    clock.ms = 1000;
    lease.renew("A");
    clock.ms = 1000 + LEASE_TIMEOUT_MS - 1;
    expect(lease.expire(true)).toEqual([]);
    clock.ms = 1000 + LEASE_TIMEOUT_MS;
    expect(lease.expire(true)).toEqual([
      {
        to: "device",
        message: {
          v: 1,
          type: "stop",
          request_id: "id2".padEnd(22, "0"),
          lease_id: "id1".padEnd(22, "0"),
        },
      },
      { to: "panel", tab: "A", message: { v: 1, type: "lease", state: "lost", reason: "expired" } },
      { to: "others", except: "A", message: { v: 1, type: "lease", state: "free" } },
    ]);
    expect(lease.holds("A")).toBe(false);
  });

  it("a message after the deadline does not renew, even before the timer ran", () => {
    lease.hello("A", false);
    clock.ms = LEASE_TIMEOUT_MS + 500;
    // The DO applies deadlines before it looks at the message.
    expect(lease.expire(false).map((e) => e.message)).toContainEqual({
      v: 1,
      type: "lease",
      state: "lost",
      reason: "expired",
    });
    lease.renew("A");
    expect(lease.holds("A")).toBe(false);
    expect(lease.nextDeadline()).toBeNull();
  });

  it("renewal by another tab does not move the deadline", () => {
    lease.hello("A", false);
    clock.ms = 2000;
    lease.renew("B");
    clock.ms = LEASE_TIMEOUT_MS;
    expect(lease.expire(false)).not.toEqual([]);
  });

  it("reports the next deadline for the timer", () => {
    expect(lease.nextDeadline()).toBeNull();
    lease.hello("A", false);
    expect(lease.nextDeadline()).toBe(LEASE_TIMEOUT_MS);
    clock.ms = 700;
    lease.renew("A");
    expect(lease.nextDeadline()).toBe(700 + LEASE_TIMEOUT_MS);
  });
});

describe("Pi leaving during a grant", () => {
  it("completes the pending grant as with the Pi offline", () => {
    lease.hello("A", true);
    expect(lease.deviceGone()).toEqual([
      {
        to: "panel",
        tab: "A",
        message: { v: 1, type: "lease", state: "granted", lease_id: "id1".padEnd(22, "0") },
      },
    ]);
    expect(lease.holds("A")).toBe(true);
  });

  it("changes nothing without a pending grant", () => {
    lease.hello("A", false);
    expect(lease.deviceGone()).toEqual([]);
    expect(lease.holds("A")).toBe(true);
  });
});

describe("owner closing", () => {
  it("frees the lease for the others and stops the Pi", () => {
    lease.hello("A", false);
    expect(lease.gone("A", true)).toEqual([
      {
        to: "device",
        message: {
          v: 1,
          type: "stop",
          request_id: "id2".padEnd(22, "0"),
          lease_id: "id1".padEnd(22, "0"),
        },
      },
      { to: "others", except: "A", message: { v: 1, type: "lease", state: "free" } },
    ]);
  });

  it("sends no stop when the Pi is offline", () => {
    lease.hello("A", false);
    expect(lease.gone("A", false).filter((e) => e.to === "device")).toEqual([]);
  });

  it("a closing tab that does not hold the lease changes nothing", () => {
    lease.hello("A", false);
    expect(lease.gone("B", true)).toEqual([]);
    expect(lease.holds("A")).toBe(true);
  });
});

describe("takeover", () => {
  it("ends the old lease at once and grants through stop and stopped", () => {
    lease.hello("A", false);
    const effects = lease.takeover("B", true);
    expect(effects[0]).toEqual({
      to: "panel",
      tab: "A",
      message: { v: 1, type: "lease", state: "lost", reason: "taken_over" },
    });
    expect(lease.holds("A")).toBe(false);
    expect(lease.holds("B")).toBe(false);
    expect(lease.stopped(stopRequestId(effects))).toEqual([
      {
        to: "panel",
        tab: "B",
        message: { v: 1, type: "lease", state: "granted", lease_id: "id2".padEnd(22, "0") },
      },
    ]);
    expect(lease.owner()).toBe("B");
  });

  it("leaves nobody with the lease when stopped does not come within 2 s", () => {
    lease.hello("A", false);
    lease.takeover("B", true);
    clock.ms = STOP_CONFIRM_TIMEOUT_MS;
    expect(lease.expire(true)).toEqual([
      {
        to: "panel",
        tab: "B",
        message: { v: 1, type: "error", reason: "stop_unconfirmed", request_id: null },
      },
      { to: "others", except: null, message: { v: 1, type: "lease", state: "free" } },
    ]);
    expect(lease.owner()).toBeNull();
  });

  it("refuses a second takeover while one is pending, without queueing it", () => {
    lease.takeover("A", true);
    expect(lease.takeover("B", true)).toEqual([
      {
        to: "panel",
        tab: "B",
        message: { v: 1, type: "error", reason: "takeover_in_progress", request_id: null },
      },
    ]);
    clock.ms = STOP_CONFIRM_TIMEOUT_MS;
    lease.expire(true);
    expect(lease.owner()).toBeNull();
  });

  it("refuses a takeover while a grant from hello is pending", () => {
    lease.hello("A", true);
    expect(lease.takeover("B", true)).toEqual([
      {
        to: "panel",
        tab: "B",
        message: { v: 1, type: "error", reason: "takeover_in_progress", request_id: null },
      },
    ]);
  });

  it("takes a free lease", () => {
    expect(lease.takeover("A", false)).toEqual([
      {
        to: "panel",
        tab: "A",
        message: { v: 1, type: "lease", state: "granted", lease_id: "id1".padEnd(22, "0") },
      },
    ]);
  });

  it("is cancelled when the taking tab closes", () => {
    lease.hello("A", false);
    const effects = lease.takeover("B", true);
    expect(lease.gone("B", true)).toEqual([
      { to: "others", except: "B", message: { v: 1, type: "lease", state: "free" } },
    ]);
    expect(lease.stopped(stopRequestId(effects))).toEqual([]);
    expect(lease.owner()).toBeNull();
  });

  it("by the owner itself regrants without telling it that it lost the lease", () => {
    lease.hello("A", false);
    const effects = lease.takeover("A", true);
    expect(effects.filter((e) => e.to === "panel")).toEqual([]);
    expect(effects).toHaveLength(1);
    expect(lease.stopped(stopRequestId(effects))).toHaveLength(1);
    expect(lease.owner()).toBe("A");
  });
});
