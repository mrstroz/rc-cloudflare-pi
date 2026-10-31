import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("serves the panel page", async () => {
  const response = await exports.default.fetch("https://rc.example/");
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('<div id="app"></div>');
});
