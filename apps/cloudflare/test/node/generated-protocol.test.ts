import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("compiles the validators ahead of time, with no code generation left for the Worker", () => {
  const code = readFileSync(new URL("../../src/generated/validators.js", import.meta.url), "utf8");
  expect(code).not.toMatch(/new Function|\beval\(/);
  expect(code).not.toMatch(/\bfrom\s+"|require\(/);
});
