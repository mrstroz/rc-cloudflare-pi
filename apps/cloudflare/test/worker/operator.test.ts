import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { accessJwt } from "./access";

const ORIGIN = "http://localhost:8787";

function panelSocket(headers: Record<string, string>, carId: string = env.CAR_ID) {
  return exports.default.fetch(`https://rc.example/ws/panel/${carId}`, {
    headers: { Upgrade: "websocket", ...headers },
  });
}

describe("panel page", () => {
  it("is not served without an operator session", async () => {
    const response = await exports.default.fetch("https://rc.example/");
    expect(response.status).toBe(401);
  });

  it("is served with the Access header", async () => {
    const response = await exports.default.fetch("https://rc.example/", {
      headers: { "Cf-Access-Jwt-Assertion": await accessJwt() },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<div id="app"></div>');
  });

  it("is served with the Access cookie", async () => {
    const response = await exports.default.fetch("https://rc.example/", {
      headers: { Cookie: `theme=dark; CF_Authorization=${await accessJwt()}` },
    });
    expect(response.status).toBe(200);
  });
});

describe("driver WebSocket", () => {
  it("is accepted with an operator session and an allowed Origin", async () => {
    const response = await panelSocket({
      Cookie: `CF_Authorization=${await accessJwt()}`,
      Origin: ORIGIN,
    });
    expect(response.status).toBe(101);
    response.webSocket?.accept();
    response.webSocket?.close(1000);
  });

  it("is rejected without an operator session", async () => {
    const response = await panelSocket({ Origin: ORIGIN });
    expect(response.status).toBe(401);
    expect(response.webSocket).toBeNull();
  });

  it.each([
    ["wrong audience", { aud: "other-application" }],
    ["wrong issuer", { iss: "https://other.cloudflareaccess.com" }],
    ["expired", { expSeconds: -60 }],
  ])("is rejected with a JWT of the %s", async (_name, claims) => {
    const response = await panelSocket({
      Cookie: `CF_Authorization=${await accessJwt(claims)}`,
      Origin: ORIGIN,
    });
    expect(response.status).toBe(401);
  });

  it("is rejected with a JWT signed by another key", async () => {
    const [header, payload] = (await accessJwt()).split(".");
    const forged = `${header ?? ""}.${payload ?? ""}.${"A".repeat(342)}`;
    const response = await panelSocket({ Cookie: `CF_Authorization=${forged}`, Origin: ORIGIN });
    expect(response.status).toBe(401);
  });

  it.each([
    ["a foreign Origin", { Origin: "https://evil.example" }],
    ["no Origin", {}],
  ])("is rejected from %s", async (_name, headers) => {
    const response = await panelSocket({
      Cookie: `CF_Authorization=${await accessJwt()}`,
      ...headers,
    });
    expect(response.status).toBe(403);
    expect(response.webSocket).toBeNull();
  });

  it("is rejected for an unknown car", async () => {
    const response = await panelSocket(
      { Cookie: `CF_Authorization=${await accessJwt()}`, Origin: ORIGIN },
      "other-car",
    );
    expect(response.status).toBe(404);
  });
});
