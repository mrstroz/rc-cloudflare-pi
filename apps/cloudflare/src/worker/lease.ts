/**
 * The driver lease of docs/spec/03 §5 as a state machine with no I/O: every input returns the
 * messages to send, and the caller delivers them and arms one timer for `nextDeadline()`.
 * The DO keeps no other drive state (ADR-0002): arming and motion belong to the Pi.
 */

export const LEASE_TIMEOUT_MS = 3000;
export const STOP_CONFIRM_TIMEOUT_MS = 2000;

/** Messages the lease produces; each matches its schema in protocol/ for the hop it goes on. */
export type LeaseMessage =
  | { v: 1; type: "lease"; state: "granted"; lease_id: string }
  | { v: 1; type: "lease"; state: "lost"; reason: "expired" | "taken_over" }
  | { v: 1; type: "lease"; state: "busy" }
  | { v: 1; type: "lease"; state: "free" }
  | { v: 1; type: "stop"; request_id: string; lease_id: string }
  | { v: 1; type: "error"; reason: "stop_unconfirmed" | "takeover_in_progress"; request_id: null };

/** `others` goes to every open panel except `except`; `device` only when the Pi is connected. */
export type Effect<Tab> =
  | { readonly to: "panel"; readonly tab: Tab; readonly message: LeaseMessage }
  | { readonly to: "others"; readonly except: Tab | null; readonly message: LeaseMessage }
  | { readonly to: "device"; readonly message: LeaseMessage };

interface Held<Tab> {
  readonly owner: Tab;
  readonly leaseId: string;
  deadline: number;
}

interface Pending<Tab> {
  readonly requester: Tab;
  readonly leaseId: string;
  readonly stopRequestId: string;
  readonly deadline: number;
}

export interface LeaseClock {
  now(): number;
  /** A fresh 128-bit id in base64url, for `lease_id` and the DO's own `request_id`. */
  newId(): string;
}

export class DriverLease<Tab> {
  private held: Held<Tab> | null = null;
  private pending: Pending<Tab> | null = null;

  constructor(private readonly clock: LeaseClock) {}

  /** Whether `tab` holds the lease now; call `expire()` first so a late message cannot count. */
  holds(tab: Tab): boolean {
    return this.held?.owner === tab;
  }

  /** The current `lease_id`, for messages the DO forwards to the Pi. */
  leaseIdOf(tab: Tab): string | null {
    return this.holds(tab) ? (this.held?.leaseId ?? null) : null;
  }

  /** Earliest moment at which `expire()` has something to do, or null. */
  nextDeadline(): number | null {
    const deadlines = [this.held?.deadline, this.pending?.deadline].filter(
      (d): d is number => d !== undefined,
    );
    return deadlines.length === 0 ? null : Math.min(...deadlines);
  }

  /**
   * Applies every deadline that has passed. Runs from the timer and before each message, so a
   * message arriving after the deadline finds the lease already gone (03 §5).
   */
  expire(deviceConnected: boolean): Effect<Tab>[] {
    const now = this.clock.now();
    const effects: Effect<Tab>[] = [];
    if (this.held !== null && now >= this.held.deadline) {
      const { owner, leaseId } = this.held;
      this.held = null;
      effects.push(
        { to: "panel", tab: owner, message: lost("expired") },
        { to: "others", except: owner, message: FREE },
        ...this.stopDevice(leaseId, deviceConnected),
      );
    }
    if (this.pending !== null && now >= this.pending.deadline) {
      const { requester } = this.pending;
      this.pending = null;
      effects.push({ to: "panel", tab: requester, message: error("stop_unconfirmed") });
    }
    return effects;
  }

  /** `hello` from a tab (03 §5): a free lease is granted, otherwise the tab learns it is busy. */
  hello(tab: Tab, deviceConnected: boolean): Effect<Tab>[] {
    if (this.held?.owner === tab) {
      return [{ to: "panel", tab, message: granted(this.held.leaseId) }];
    }
    if (this.pending?.requester === tab) {
      return [];
    }
    if (this.held !== null || this.pending !== null) {
      return [{ to: "panel", tab, message: BUSY }];
    }
    return this.grant(tab, deviceConnected);
  }

  /** A valid `heartbeat` or `drive` from the owner moves the deadline (03 §5). */
  renew(tab: Tab): void {
    if (this.held?.owner === tab) {
      this.held.deadline = this.clock.now() + LEASE_TIMEOUT_MS;
    }
  }

  /** `stopped` from the Pi. Only the `request_id` of the pending grant's own `stop` confirms it. */
  stopped(requestId: string | null): Effect<Tab>[] {
    if (requestId === null || this.pending?.stopRequestId !== requestId) {
      return [];
    }
    const { requester, leaseId } = this.pending;
    this.pending = null;
    return this.hold(requester, leaseId);
  }

  /** A tab closed. The owner's lease ends with `stop`; a requester's grant is cancelled. */
  gone(tab: Tab, deviceConnected: boolean): Effect<Tab>[] {
    if (this.pending?.requester === tab) {
      this.pending = null;
    }
    if (this.held?.owner !== tab) {
      return [];
    }
    const { leaseId } = this.held;
    this.held = null;
    return [
      { to: "others", except: tab, message: FREE },
      ...this.stopDevice(leaseId, deviceConnected),
    ];
  }

  /**
   * Every grant takes this path (03 §5): with the Pi connected, `stop` first and the lease only
   * after its `stopped`; with the Pi offline at once, since a new Pi connection starts disarmed.
   */
  private grant(tab: Tab, deviceConnected: boolean): Effect<Tab>[] {
    const leaseId = this.clock.newId();
    if (!deviceConnected) {
      return this.hold(tab, leaseId);
    }
    const stopRequestId = this.clock.newId();
    this.pending = {
      requester: tab,
      leaseId,
      stopRequestId,
      deadline: this.clock.now() + STOP_CONFIRM_TIMEOUT_MS,
    };
    return [{ to: "device", message: stop(stopRequestId, leaseId) }];
  }

  private hold(tab: Tab, leaseId: string): Effect<Tab>[] {
    this.held = { owner: tab, leaseId, deadline: this.clock.now() + LEASE_TIMEOUT_MS };
    return [{ to: "panel", tab, message: granted(leaseId) }];
  }

  private stopDevice(leaseId: string, deviceConnected: boolean): Effect<Tab>[] {
    return deviceConnected ? [{ to: "device", message: stop(this.clock.newId(), leaseId) }] : [];
  }
}

const BUSY: LeaseMessage = { v: 1, type: "lease", state: "busy" };
const FREE: LeaseMessage = { v: 1, type: "lease", state: "free" };

function lost(reason: "expired" | "taken_over"): LeaseMessage {
  return { v: 1, type: "lease", state: "lost", reason };
}

function granted(leaseId: string): LeaseMessage {
  return { v: 1, type: "lease", state: "granted", lease_id: leaseId };
}

function stop(requestId: string, leaseId: string): LeaseMessage {
  return { v: 1, type: "stop", request_id: requestId, lease_id: leaseId };
}

function error(reason: "stop_unconfirmed" | "takeover_in_progress"): LeaseMessage {
  return { v: 1, type: "error", reason, request_id: null };
}
