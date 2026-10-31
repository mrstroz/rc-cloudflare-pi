/**
 * Round-trip estimate of docs/spec/02 §7: `now − sent[id, n] − age`, where the Pi reports in
 * `status` the last `n` it accepted and how long ago. Before arming it runs on heartbeats, in a
 * session on drive. It approximates command plus telemetry; it is not a one-way delay.
 */

export const HISTORY_SIZE = 64;

/** The fields of `status` the estimate reads. */
export interface StatusSample {
  readonly session_id: string | null;
  readonly last_seq: number | null;
  readonly seq_age_ms: number | null;
  readonly lease_id: string | null;
  readonly last_heartbeat_seq: number | null;
  readonly heartbeat_age_ms: number | null;
}

export interface RoundTripSample {
  readonly ms: number;
  readonly source: "drive" | "heartbeat";
}

/** Send times by key, oldest dropped first. */
class History {
  private readonly sent = new Map<string, number>();

  record(key: string, at: number): void {
    this.sent.delete(key);
    this.sent.set(key, at);
    if (this.sent.size > HISTORY_SIZE) {
      const oldest = this.sent.keys().next().value;
      if (oldest !== undefined) {
        this.sent.delete(oldest);
      }
    }
  }

  at(key: string): number | undefined {
    return this.sent.get(key);
  }

  clear(): void {
    this.sent.clear();
  }
}

export class RoundTrip {
  private readonly drives = new History();
  private readonly heartbeats = new History();
  private lastKey: string | null = null;

  sentDrive(sessionId: string, seq: number, at: number): void {
    this.drives.record(`${sessionId}:${String(seq)}`, at);
  }

  sentHeartbeat(leaseId: string, heartbeatSeq: number, at: number): void {
    this.heartbeats.record(`${leaseId}:${String(heartbeatSeq)}`, at);
  }

  /** A change of session or lease makes every entry foreign (02 §7). */
  reset(): void {
    this.drives.clear();
    this.heartbeats.clear();
    this.lastKey = null;
  }

  /**
   * The estimate for one `status`, or null for "brak pomiaru": a foreign id, no entry, a
   * negative result, or no new confirmation since the previous status.
   */
  fromStatus(status: StatusSample, now: number): RoundTripSample | null {
    const probe = this.probe(status);
    if (probe === null) {
      return null;
    }
    const sentAt = probe.history.at(probe.key);
    if (sentAt === undefined || probe.key === this.lastKey) {
      return null;
    }
    this.lastKey = probe.key;
    const ms = now - sentAt - probe.age;
    return ms < 0 ? null : { ms, source: probe.source };
  }

  /** In a session the drive confirmation counts, before it the heartbeat one. */
  private probe(
    status: StatusSample,
  ): { source: RoundTripSample["source"]; key: string; age: number; history: History } | null {
    if (status.session_id !== null && status.last_seq !== null && status.seq_age_ms !== null) {
      return {
        source: "drive",
        key: `${status.session_id}:${String(status.last_seq)}`,
        age: status.seq_age_ms,
        history: this.drives,
      };
    }
    if (
      status.lease_id !== null &&
      status.last_heartbeat_seq !== null &&
      status.heartbeat_age_ms !== null
    ) {
      return {
        source: "heartbeat",
        key: `${status.lease_id}:${String(status.last_heartbeat_seq)}`,
        age: status.heartbeat_age_ms,
        history: this.heartbeats,
      };
    }
    return null;
  }
}
