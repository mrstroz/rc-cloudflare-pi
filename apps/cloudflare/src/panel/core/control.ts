import type { Wheels } from "./inputs";
import { RoundTrip, type RoundTripSample, type StatusSample } from "./rtt";
import { newId } from "../../shared/ids";

/**
 * The panel's side of docs/spec/04 §3–§5 for one WebSocket. It shows what the Pi confirmed and
 * holds no drive decision of its own (ADR-0002): "Sterowanie aktywne" means only that the Pi
 * answered `armed` to this tab's pending `request_id` in this lease.
 */

export const DRIVE_PERIOD_MS = 50;
export const HEARTBEAT_PERIOD_MS = 1000;

/** What the controller needs from a WebSocket; `bufferedAmount` is used from RC-43 on. */
export interface PanelSocket {
  send(text: string): void;
  readonly bufferedAmount: number;
}

/** Time for the round-trip estimate, and whether the tab is visible (heartbeat, 04 §4). */
export interface PanelClock {
  now(): number;
  visible(): boolean;
}

export type LeaseState = "unknown" | "granted" | "busy" | "free" | "lost";

/** Statuses of 04 §5. */
export type PanelStatus = "offline" | "busy" | "ready" | "active" | "stopped" | "error";

interface Session {
  readonly sessionId: string;
  token: string;
  seq: number;
}

interface Incoming {
  readonly type: string;
  readonly [field: string]: unknown;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Pi reasons a new arm may resolve; anything else shows "Błąd" (04 §5). */
const TRANSIENT_ERRORS: ReadonlySet<string> = new Set(["rate_limited", "lease_mismatch"]);

export class DriveControl {
  deviceConnected: boolean | null = null;
  lease: LeaseState = "unknown";
  leaseId: string | null = null;
  pendingArm: string | null = null;
  session: Session | null = null;
  stopCause: string | null = null;
  error: string | null = null;
  lastStatusAt: number | null = null;
  lostReason: string | null = null;
  /** The latest round-trip estimate (02 §7); null shows "brak pomiaru". */
  roundTrip: RoundTripSample | null = null;
  private readonly samples = new RoundTrip();
  private heartbeatSeq = 0;
  private driveTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly socket: PanelSocket,
    private readonly wheels: () => Wheels,
    private readonly clock: PanelClock,
  ) {}

  /** The socket is open: announce the tab and start the heartbeat (04 §4). */
  opened(): void {
    this.send({ type: "hello" });
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat();
    }, HEARTBEAT_PERIOD_MS);
  }

  /** The socket closed: nothing of this connection carries over (04 §3). */
  closed(): void {
    this.endSession();
    this.pendingArm = null;
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  get status(): PanelStatus {
    if (this.deviceConnected !== true) {
      return "offline";
    }
    if (this.lease === "busy") {
      return "busy";
    }
    if (this.session !== null) {
      return "active";
    }
    if (this.error !== null) {
      return "error";
    }
    return this.stopCause === null ? "ready" : "stopped";
  }

  /** "Aktywuj sterowanie": only with the lease, neutral inputs and nothing armed or pending. */
  get canArm(): boolean {
    const { left, right } = this.wheels();
    return (
      this.lease === "granted" &&
      this.deviceConnected === true &&
      this.session === null &&
      this.pendingArm === null &&
      left === 0 &&
      right === 0
    );
  }

  /** "Przejmij" is offered when another tab holds the lease or nobody does (04 §3). */
  get canTakeOver(): boolean {
    return this.lease === "busy" || this.lease === "free" || this.lease === "lost";
  }

  arm(): void {
    if (!this.canArm) {
      return;
    }
    this.error = null;
    this.stopCause = null;
    this.pendingArm = newId();
    this.send({ type: "arm", request_id: this.pendingArm });
  }

  takeOver(): void {
    if (this.canTakeOver) {
      this.error = null;
      this.send({ type: "takeover" });
    }
  }

  /** STOP, a hidden tab or lost focus: always sent while this tab holds the lease (04 §2). */
  stop(): void {
    this.pendingArm = null;
    this.endSession();
    if (this.lease === "granted") {
      this.send({ type: "stop", request_id: newId() });
    }
  }

  receive(frame: string): void {
    let message: Incoming;
    try {
      message = JSON.parse(frame) as Incoming;
    } catch {
      console.warn("rc-panel: frame from the DO is not JSON", frame);
      return;
    }
    switch (message.type) {
      case "device_link":
        this.deviceConnected = message.connected === true;
        if (!this.deviceConnected) {
          this.endSession();
          this.pendingArm = null;
        }
        break;
      case "lease":
        this.onLease(message);
        break;
      case "armed":
        this.onArmed(message);
        break;
      case "control_token":
        if (this.session !== null && message.session_id === this.session.sessionId) {
          this.session.token = text(message.freshness_token) ?? this.session.token;
        }
        break;
      case "stopped":
        this.endSession();
        this.stopCause = text(message.cause);
        break;
      case "status":
        this.onStatus(message);
        break;
      case "error":
        this.onError(message);
        break;
    }
  }

  private onLease(message: Incoming): void {
    const state = message.state;
    if (state === "granted") {
      if (this.leaseId !== text(message.lease_id)) {
        this.samples.reset();
      }
      this.lease = "granted";
      this.leaseId = text(message.lease_id);
      this.lostReason = null;
      return;
    }
    // Losing the lease cancels a pending arm; the DO sends the stop (04 §3).
    this.leaseId = null;
    this.pendingArm = null;
    this.endSession();
    if (state === "lost") {
      this.lease = "lost";
      this.lostReason = text(message.reason);
    } else if (state === "busy" || state === "free") {
      this.lease = state;
    }
  }

  private onArmed(message: Incoming): void {
    if (this.pendingArm === null || message.request_id !== this.pendingArm) {
      return;
    }
    const sessionId = text(message.session_id);
    const token = text(message.freshness_token);
    if (sessionId === null || token === null) {
      return;
    }
    this.pendingArm = null;
    this.samples.reset();
    this.session = { sessionId, token, seq: 0 };
    this.driveTimer = setInterval(() => {
      this.drive();
    }, DRIVE_PERIOD_MS);
  }

  private onStatus(message: Incoming): void {
    this.lastStatusAt = this.clock.now();
    // The DO validated the frame against status.schema.json before forwarding it.
    this.roundTrip = this.samples.fromStatus(message as unknown as StatusSample, this.lastStatusAt);
    if (this.roundTrip !== null) {
      // 04 §6: v1 keeps the samples in the browser log, the source of the timing profile.
      console.info("rc-rtt", this.roundTrip.source, Math.round(this.roundTrip.ms));
    }
    if (message.state === "disarmed" && this.session !== null) {
      this.endSession();
      this.stopCause = text(message.stop_cause);
    }
  }

  private onError(message: Incoming): void {
    const reason = text(message.reason) ?? "invalid_message";
    if (message.request_id !== null && message.request_id === this.pendingArm) {
      this.pendingArm = null;
    }
    if (!TRANSIENT_ERRORS.has(reason)) {
      this.error = reason;
    }
  }

  /** Every 50 ms the full state of both wheels with the newest token (04 §4). */
  private drive(): void {
    if (this.session === null) {
      return;
    }
    this.session.seq += 1;
    this.samples.sentDrive(this.session.sessionId, this.session.seq, this.clock.now());
    const { left, right } = this.wheels();
    this.send({
      type: "drive",
      session_id: this.session.sessionId,
      seq: this.session.seq,
      freshness_token: this.session.token,
      left,
      right,
    });
  }

  private heartbeat(): void {
    if (this.lease !== "granted" || !this.clock.visible()) {
      return;
    }
    this.heartbeatSeq += 1;
    if (this.leaseId !== null) {
      this.samples.sentHeartbeat(this.leaseId, this.heartbeatSeq, this.clock.now());
    }
    this.send({ type: "heartbeat", heartbeat_seq: this.heartbeatSeq });
  }

  private endSession(): void {
    if (this.session !== null) {
      this.samples.reset();
    }
    this.session = null;
    if (this.driveTimer !== null) {
      clearInterval(this.driveTimer);
      this.driveTimer = null;
    }
  }

  private send(message: object): void {
    this.socket.send(JSON.stringify({ v: 1, ...message }));
  }
}
