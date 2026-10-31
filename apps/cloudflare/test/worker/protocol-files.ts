/** protocol/ read through Vite at test time; the Workers runtime has no file system. */

interface CaseFrame {
  t_ms: number;
  frame: string;
  pad?: "limit" | "limit+1";
}

interface ProtocolCase {
  case: string;
  covers: string;
  hop: { from: string; to: string };
  frames: CaseFrame[];
  context?: { sender_holds_lease?: boolean };
  twin?: string[];
  expect: { reason: string | null };
}

interface TokenVector {
  name: string;
  token: string;
  pattern_rejects?: boolean;
}

const examples = Object.values(
  import.meta.glob<ProtocolCase>("../../../../protocol/examples/{valid,invalid}/*.case.json", {
    eager: true,
    import: "default",
  }),
);

const tokens = Object.values(
  import.meta.glob<{ valid: TokenVector[]; invalid: TokenVector[] }>(
    "../../../../protocol/vectors/token-v1.json",
    { eager: true, import: "default" },
  ),
)[0] ?? { valid: [], invalid: [] };

export default { examples, tokens };
