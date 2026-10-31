import { beforeEach, describe, expect, it } from "vitest";
import { HISTORY_SIZE, RoundTrip, type StatusSample } from "../../src/panel/core/rtt";

const SESSION = "kQ3v9XbT2mWc7ZyH4nPdLe";
const LEASE = "r8JfA0sUo5GxN1tVqBhY6w";

const DISARMED: StatusSample = {
  session_id: null,
  last_seq: null,
  seq_age_ms: null,
  lease_id: LEASE,
  last_heartbeat_seq: 7,
  heartbeat_age_ms: 40,
};
const ARMED: StatusSample = {
  session_id: SESSION,
  last_seq: 12,
  seq_age_ms: 15,
  lease_id: LEASE,
  last_heartbeat_seq: 7,
  heartbeat_age_ms: 400,
};

let rtt: RoundTrip;
beforeEach(() => {
  rtt = new RoundTrip();
});

describe("round-trip estimate (02 §7)", () => {
  it("uses heartbeats before arming", () => {
    rtt.sentHeartbeat(LEASE, 7, 1000);
    expect(rtt.fromStatus(DISARMED, 1200)).toEqual({ ms: 160, source: "heartbeat" });
  });

  it("uses drive in a session", () => {
    rtt.sentHeartbeat(LEASE, 7, 900);
    rtt.sentDrive(SESSION, 12, 1000);
    expect(rtt.fromStatus(ARMED, 1100)).toEqual({ ms: 85, source: "drive" });
  });

  it("gives no measurement for a foreign session id", () => {
    rtt.sentDrive(SESSION, 12, 1000);
    expect(rtt.fromStatus({ ...ARMED, session_id: "AAAAAAAAAAAAAAAAAAAAAA" }, 1100)).toBeNull();
  });

  it("gives no measurement for a foreign lease id", () => {
    rtt.sentHeartbeat(LEASE, 7, 1000);
    expect(rtt.fromStatus({ ...DISARMED, lease_id: "AAAAAAAAAAAAAAAAAAAAAA" }, 1200)).toBeNull();
  });

  it("gives no measurement without an entry", () => {
    rtt.sentDrive(SESSION, 11, 1000);
    expect(rtt.fromStatus(ARMED, 1100)).toBeNull();
  });

  it("gives no measurement for a negative result", () => {
    rtt.sentDrive(SESSION, 12, 1000);
    expect(rtt.fromStatus({ ...ARMED, seq_age_ms: 200 }, 1100)).toBeNull();
  });

  it("gives no measurement without anything to measure", () => {
    expect(
      rtt.fromStatus(
        { ...DISARMED, lease_id: null, last_heartbeat_seq: null, heartbeat_age_ms: null },
        0,
      ),
    ).toBeNull();
  });

  it("gives no new measurement while confirmations make no progress", () => {
    rtt.sentDrive(SESSION, 12, 1000);
    expect(rtt.fromStatus(ARMED, 1100)).not.toBeNull();
    expect(rtt.fromStatus(ARMED, 1300)).toBeNull();
    rtt.sentDrive(SESSION, 13, 1250);
    expect(rtt.fromStatus({ ...ARMED, last_seq: 13, seq_age_ms: 10 }, 1350)).toEqual({
      ms: 90,
      source: "drive",
    });
  });

  it("forgets everything on reset", () => {
    rtt.sentDrive(SESSION, 12, 1000);
    rtt.reset();
    expect(rtt.fromStatus(ARMED, 1100)).toBeNull();
  });

  it("keeps a bounded history", () => {
    for (let seq = 1; seq <= HISTORY_SIZE + 1; seq += 1) {
      rtt.sentDrive(SESSION, seq, seq);
    }
    expect(rtt.fromStatus({ ...ARMED, last_seq: 1, seq_age_ms: 0 }, 100)).toBeNull();
    expect(rtt.fromStatus({ ...ARMED, last_seq: 2, seq_age_ms: 0 }, 100)).toEqual({
      ms: 98,
      source: "drive",
    });
  });
});
