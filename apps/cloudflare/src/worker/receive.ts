import { HOPS, LIMITS, VALIDATORS } from "../generated/protocol";
import { parseStrict, StrictJsonError } from "./strict-json";

/** The three ends of a connection in protocol/message-types.json. */
export type Party = "panel" | "server" | "device";

export type ErrorReason =
  "invalid_message" | "wrong_role" | "frame_too_large" | "rate_limited" | "lease_mismatch";

/** A message that passed every rule: an object with a known `type`, valid for its hop. */
export interface Message {
  readonly v: 1;
  readonly type: string;
  readonly [field: string]: unknown;
}

export type Verdict =
  | { readonly ok: true; readonly message: Message }
  | { readonly ok: false; readonly reason: ErrorReason; readonly requestId: string | null };

type RatedType = keyof typeof LIMITS.rate;

const LEASED_TYPES: ReadonlySet<string> = new Set(["arm", "stop", "drive"]);
const encoder = new TextEncoder();

function isRated(type: string): type is RatedType {
  return Object.hasOwn(LIMITS.rate, type);
}

/**
 * Per-connection message times by type, for the window `[t, t + window_ms)` of 02 §10. Every
 * message that passed the schema counts, also one this window then rejects. Only the last
 * `max` times per type matter, so memory stays bounded however fast a sender floods.
 */
export class RateWindows {
  private readonly times = new Map<RatedType, number[]>();

  /** Records a message at `nowMs` and says whether it stays within the limit. */
  admit(type: RatedType, nowMs: number): boolean {
    const { max, window_ms } = LIMITS.rate[type];
    const times = this.times.get(type) ?? [];
    const inWindow = times.filter((t) => nowMs - t < window_ms).length + 1;
    times.push(nowMs);
    if (times.length > max) {
      times.shift();
    }
    this.times.set(type, times);
    return inWindow <= max;
  }
}

export interface Receiving {
  readonly from: Party;
  readonly to: Party;
  readonly nowMs: number;
  /** Present only where the DO receives: the Pi does not rate-limit frames from the DO. */
  readonly rates?: RateWindows;
  /** Whether the panel sending `arm`, `stop` or `drive` holds the current lease. */
  readonly holdsLease?: boolean;
}

/** `request_id` is echoed only from a frame that passed the schema; otherwise it is unknown. */
function reject(reason: ErrorReason, message?: Message): Verdict {
  const requestId = message?.request_id;
  return { ok: false, reason, requestId: typeof requestId === "string" ? requestId : null };
}

function hasStringType(value: unknown): value is { type: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

/**
 * The receiver rules of docs/spec/02 §10 in their order: size, parse, role, schema, rate,
 * lease. The first broken rule names the reason.
 */
export function receive(frame: string, at: Receiving): Verdict {
  if (encoder.encode(frame).length > LIMITS.max_frame_bytes) {
    return reject("frame_too_large");
  }
  let parsed: unknown;
  try {
    parsed = parseStrict(frame);
  } catch (error) {
    if (error instanceof StrictJsonError) {
      return reject("invalid_message");
    }
    throw error;
  }
  if (!hasStringType(parsed) || !HOPS.some((hop) => hop.type === parsed.type)) {
    return reject("invalid_message");
  }
  const hop = HOPS.find((h) => h.type === parsed.type && h.from === at.from && h.to === at.to);
  if (hop === undefined) {
    return reject("wrong_role");
  }
  if (!VALIDATORS[hop.validator](parsed)) {
    return reject("invalid_message");
  }
  const message = parsed as Message;
  if (at.rates !== undefined && isRated(message.type) && !at.rates.admit(message.type, at.nowMs)) {
    return reject("rate_limited", message);
  }
  if (at.from === "panel" && LEASED_TYPES.has(message.type) && at.holdsLease !== true) {
    return reject("lease_mismatch", message);
  }
  return { ok: true, message };
}
