import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRIVE_PERIOD_MS, DriveControl, HEARTBEAT_PERIOD_MS } from "../../src/panel/core/control";
import type { Wheels } from "../../src/panel/core/inputs";

const SESSION = "kQ3v9XbT2mWc7ZyH4nPdLe";
const TOKEN_1 = "4200.kF7FLu2kWOb_gvVlpETLkCxjMa91_w7RYdLoyLNS5Rw";
const TOKEN_2 = "4250.t7nkPssPxLNf4a4O89y7DQhNqVnaAenJIhSZtVN2L-8";
const LEASE = "r8JfA0sUo5GxN1tVqBhY6w";

class FakeSocket {
  bufferedAmount = 0;
  readonly sent: Record<string, unknown>[] = [];
  send(text: string): void {
    this.sent.push(JSON.parse(text) as Record<string, unknown>);
  }
  ofType(type: string): Record<string, unknown>[] {
    return this.sent.filter((m) => m.type === type);
  }
  last(type: string): Record<string, unknown> | undefined {
    return this.ofType(type).at(-1);
  }
}

let socket: FakeSocket;
let nowMs: number;
let wheels: Wheels;
let control: DriveControl;

function deliver(message: object): void {
  control.receive(JSON.stringify({ v: 1, ...message }));
}

/** An open connection with the Pi online and the lease granted to this tab. */
function readyTab(): void {
  control.opened();
  deliver({ type: "device_link", connected: true });
  deliver({ type: "lease", state: "granted", lease_id: LEASE });
}

function armedTab(): string {
  readyTab();
  control.arm();
  const requestId = socket.last("arm")?.request_id as string;
  deliver({ type: "armed", request_id: requestId, session_id: SESSION, freshness_token: TOKEN_1 });
  return requestId;
}

beforeEach(() => {
  vi.useFakeTimers();
  socket = new FakeSocket();
  wheels = { left: 0, right: 0 };
  nowMs = 0;
  control = new DriveControl(socket, () => wheels, { now: () => nowMs, visible: () => true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("statuses (04 §5)", () => {
  it("goes offline → ready → active and says hello first", () => {
    control.opened();
    expect(socket.sent[0]).toEqual({ v: 1, type: "hello" });
    expect(control.status).toBe("offline");
    deliver({ type: "device_link", connected: true });
    deliver({ type: "lease", state: "granted", lease_id: LEASE });
    expect(control.status).toBe("ready");
    armedTab();
    expect(control.status).toBe("active");
  });

  it("shows busy with takeover when another tab holds the lease", () => {
    control.opened();
    deliver({ type: "device_link", connected: true });
    deliver({ type: "lease", state: "busy" });
    expect(control.status).toBe("busy");
    expect(control.canTakeOver).toBe(true);
    expect(control.canArm).toBe(false);
    control.takeOver();
    expect(socket.last("takeover")).toEqual({ v: 1, type: "takeover" });
  });

  it("shows the stop cause the Pi reports", () => {
    armedTab();
    deliver({ type: "status", state: "disarmed", stop_cause: "watchdog_timeout" });
    expect(control.status).toBe("stopped");
    expect(control.stopCause).toBe("watchdog_timeout");
  });

  it("shows the cause from stopped", () => {
    armedTab();
    deliver({ type: "stopped", request_id: "e5HsW0uJ3Fg8NaCyOzXb1Q", cause: "link_lost" });
    expect(control.status).toBe("stopped");
    expect(control.stopCause).toBe("link_lost");
  });

  it("shows an error from the Pi that a new arm does not solve, and drops the pending arm", () => {
    readyTab();
    control.arm();
    const requestId = socket.last("arm")?.request_id;
    deliver({ type: "error", reason: "stop_unconfirmed", request_id: requestId });
    expect(control.status).toBe("error");
    expect(control.pendingArm).toBeNull();
  });
});

describe("activation (04 §3)", () => {
  it("sends arm with a fresh request_id only with the lease and neutral inputs", () => {
    readyTab();
    wheels = { left: 0.2, right: 0 };
    expect(control.canArm).toBe(false);
    control.arm();
    expect(socket.ofType("arm")).toEqual([]);

    wheels = { left: 0, right: 0 };
    control.arm();
    expect(socket.last("arm")).toEqual({
      v: 1,
      type: "arm",
      request_id: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
    });
    expect(control.canArm).toBe(false);
  });

  it("does not arm without the lease", () => {
    control.opened();
    deliver({ type: "device_link", connected: true });
    control.arm();
    expect(socket.ofType("arm")).toEqual([]);
  });
});

describe("sending (04 §4)", () => {
  it("sends drive every 50 ms with the newest token, also with unchanged inputs", () => {
    armedTab();
    wheels = { left: 0.5, right: -0.25 };
    vi.advanceTimersByTime(DRIVE_PERIOD_MS);
    expect(socket.last("drive")).toEqual({
      v: 1,
      type: "drive",
      session_id: SESSION,
      seq: 1,
      freshness_token: TOKEN_1,
      left: 0.5,
      right: -0.25,
    });
    deliver({ type: "control_token", session_id: SESSION, freshness_token: TOKEN_2 });
    vi.advanceTimersByTime(DRIVE_PERIOD_MS * 2);
    expect(socket.ofType("drive").map((d) => [d.seq, d.freshness_token])).toEqual([
      [1, TOKEN_1],
      [2, TOKEN_2],
      [3, TOKEN_2],
    ]);
  });

  it("ignores a token of another session", () => {
    armedTab();
    deliver({
      type: "control_token",
      session_id: "AAAAAAAAAAAAAAAAAAAAAA",
      freshness_token: TOKEN_2,
    });
    vi.advanceTimersByTime(DRIVE_PERIOD_MS);
    expect(socket.last("drive")?.freshness_token).toBe(TOKEN_1);
  });

  it("sends no drive before armed and none after stop", () => {
    readyTab();
    vi.advanceTimersByTime(DRIVE_PERIOD_MS * 4);
    expect(socket.ofType("drive")).toEqual([]);
    armedTab();
    control.stop();
    expect(socket.last("stop")).toMatchObject({ type: "stop" });
    vi.advanceTimersByTime(DRIVE_PERIOD_MS * 4);
    expect(socket.ofType("drive")).toEqual([]);
    expect(control.status).toBe("ready");
  });

  it("sends a heartbeat every second while holding the lease in a visible tab", () => {
    readyTab();
    vi.advanceTimersByTime(HEARTBEAT_PERIOD_MS * 3);
    expect(socket.ofType("heartbeat").map((h) => h.heartbeat_seq)).toEqual([1, 2, 3]);
  });

  it("sends no heartbeat without the lease", () => {
    control.opened();
    deliver({ type: "lease", state: "busy" });
    vi.advanceTimersByTime(HEARTBEAT_PERIOD_MS * 3);
    expect(socket.ofType("heartbeat")).toEqual([]);
  });

  it("stops sending drive when the lease is lost and asks for a new activation", () => {
    armedTab();
    deliver({ type: "lease", state: "lost", reason: "expired" });
    vi.advanceTimersByTime(DRIVE_PERIOD_MS * 4);
    expect(socket.ofType("drive")).toEqual([]);
    expect(control.session).toBeNull();
    expect(control.canTakeOver).toBe(true);
  });

  it("ends the session when the Pi goes offline", () => {
    armedTab();
    deliver({ type: "device_link", connected: false });
    vi.advanceTimersByTime(DRIVE_PERIOD_MS * 2);
    expect(socket.ofType("drive")).toEqual([]);
    expect(control.status).toBe("offline");
  });

  it("stops every timer when the socket closes", () => {
    armedTab();
    control.closed();
    vi.advanceTimersByTime(HEARTBEAT_PERIOD_MS * 2);
    expect(socket.ofType("drive")).toEqual([]);
    expect(socket.ofType("heartbeat")).toEqual([]);
  });
});

describe("round-trip estimate (04 §6)", () => {
  const status = {
    type: "status",
    state: "disarmed",
    session_id: null,
    last_seq: null,
    seq_age_ms: null,
    lease_id: LEASE,
    last_heartbeat_seq: 1,
    heartbeat_age_ms: 30,
    stop_cause: null,
  };

  it("measures from heartbeats before arming and shows no measurement otherwise", () => {
    readyTab();
    nowMs = 1000;
    vi.advanceTimersByTime(HEARTBEAT_PERIOD_MS);
    nowMs = 1100;
    deliver(status);
    expect(control.roundTrip).toEqual({ ms: 70, source: "heartbeat" });
    deliver(status);
    expect(control.roundTrip).toBeNull();
    deliver({ ...status, lease_id: "AAAAAAAAAAAAAAAAAAAAAA" });
    expect(control.roundTrip).toBeNull();
  });

  it("measures from drive in a session", () => {
    armedTab();
    nowMs = 2000;
    vi.advanceTimersByTime(DRIVE_PERIOD_MS);
    nowMs = 2060;
    deliver({ ...status, state: "armed", session_id: SESSION, last_seq: 1, seq_age_ms: 10 });
    expect(control.roundTrip).toEqual({ ms: 50, source: "drive" });
  });
});

it("ignores a frame that is not JSON", () => {
  readyTab();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  control.receive("not json");
  expect(warn).toHaveBeenCalledOnce();
  expect(control.status).toBe("ready");
  warn.mockRestore();
});
