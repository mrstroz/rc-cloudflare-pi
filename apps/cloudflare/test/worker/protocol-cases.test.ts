/**
 * RC-26: every case in protocol/examples and every token vector gives the result recorded in
 * its file (docs/spec/02 §10), read from protocol/ itself, as apps/pi-agent/tests does.
 */
import { describe, expect, it } from "vitest";
import { LIMITS, VALIDATORS } from "../../src/generated/protocol";
import { RateWindows, receive, type Party } from "../../src/worker/receive";
import cases from "./protocol-files";

function padded(frame: { frame: string; pad?: "limit" | "limit+1" }): string {
  if (frame.pad === undefined) {
    return frame.frame;
  }
  const target = LIMITS.max_frame_bytes + (frame.pad === "limit+1" ? 1 : 0);
  return frame.frame + " ".repeat(target - new TextEncoder().encode(frame.frame).length);
}

/** Runs a case's frames on one connection and returns the verdict of the last one. */
function lastVerdict(testCase: (typeof cases.examples)[number]) {
  const { from, to } = testCase.hop as { from: Party; to: Party };
  const rates = to === "server" ? new RateWindows() : undefined;
  const holdsLease = testCase.context?.sender_holds_lease ?? true;
  const verdicts = testCase.frames.map((frame) =>
    receive(padded(frame), {
      from,
      to,
      nowMs: frame.t_ms,
      holdsLease,
      ...(rates === undefined ? {} : { rates }),
    }),
  );
  for (const earlier of verdicts.slice(0, -1)) {
    expect(earlier).toMatchObject({ ok: true });
  }
  return verdicts.at(-1);
}

describe("protocol/examples", () => {
  it("reads all cases", () => {
    expect(cases.examples.length).toBeGreaterThanOrEqual(60);
  });

  it.each(cases.examples.map((c) => [c.case, c] as const))("%s", (_name, testCase) => {
    const verdict = lastVerdict(testCase);
    const reason = testCase.expect.reason;
    expect(verdict).toEqual(
      reason === null
        ? expect.objectContaining({ ok: true })
        : expect.objectContaining({ ok: false, reason }),
    );
  });
});

describe("protocol/vectors/token-v1.json", () => {
  const drive = cases.examples.find((c) => c.case === "drive-panel-server");
  const base = JSON.parse(drive?.frames[0]?.frame ?? "null") as Record<string, unknown>;
  const vectors = [...cases.tokens.valid, ...cases.tokens.invalid];

  it("reads all vectors", () => {
    expect(vectors.length).toBeGreaterThan(10);
  });

  it.each(vectors.map((v) => [v.name, v] as const))("%s", (_name, vector) => {
    const accepted = VALIDATORS.drive_client({ ...base, freshness_token: vector.token });
    const rejects = "pattern_rejects" in vector ? vector.pattern_rejects : false;
    expect(accepted).toBe(!rejects);
  });
});
