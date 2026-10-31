import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps the dev/test-only Access key set out of wrangler.jsonc", () => {
  const config = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
  expect(config).not.toContain("ACCESS_JWKS");
});
