import type { Message } from "./receive";

/** Panel messages that go on to the Pi, in their `*.client` form (protocol/schemas). */
export type ForwardedType = "heartbeat" | "arm" | "drive" | "stop";

const CLIENT_FIELDS: Record<ForwardedType, readonly string[]> = {
  heartbeat: ["heartbeat_seq"],
  arm: ["request_id"],
  stop: ["request_id"],
  drive: ["session_id", "seq", "freshness_token", "left", "right"],
};

export function isForwarded(type: string): type is ForwardedType {
  return Object.hasOwn(CLIENT_FIELDS, type);
}

/**
 * The `*.forwarded` form for the Pi (docs/spec/02 §10): a new object from the fields of the
 * validated client form plus the DO's own `lease_id`, never a copy of the frame as received.
 */
export function toDevice(type: ForwardedType, message: Message, leaseId: string): object {
  const fields = Object.fromEntries(CLIENT_FIELDS[type].map((name) => [name, message[name]]));
  return { v: 1, type, ...fields, lease_id: leaseId };
}

/** Pi messages that go to the driver unchanged (docs/spec/03 §7). */
const TO_DRIVER: ReadonlySet<string> = new Set([
  "armed",
  "control_token",
  "stopped",
  "status",
  "error",
]);

export function goesToDriver(type: string): boolean {
  return TO_DRIVER.has(type);
}
