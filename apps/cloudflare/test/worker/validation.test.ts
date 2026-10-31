import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { accessJwt } from "./access";

async function openSocket(path: string, headers: Record<string, string>): Promise<WebSocket> {
  const response = await exports.default.fetch(`https://rc.example${path}`, {
    headers: { Upgrade: "websocket", ...headers },
  });
  const socket = response.webSocket;
  if (socket === null) {
    throw new Error(`no WebSocket, status ${String(response.status)}`);
  }
  socket.accept();
  return socket;
}

async function openPanel(): Promise<WebSocket> {
  return openSocket(`/ws/panel/${env.CAR_ID}`, {
    Cookie: `CF_Authorization=${await accessJwt()}`,
    Origin: "http://localhost:8787",
  });
}

function nextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    socket.addEventListener(
      "message",
      (event) => {
        resolve(JSON.parse(event.data as string));
      },
      { once: true },
    );
  });
}

describe("DO validation", () => {
  it("answers a malformed panel frame with error invalid_message", async () => {
    const panel = await openPanel();
    const reply = nextMessage(panel);
    panel.send('{"v":1,"type":"drive","left":0.1,"left":0.2}');
    expect(await reply).toEqual({
      v: 1,
      type: "error",
      reason: "invalid_message",
      request_id: null,
    });
    panel.close(1000);
  });

  it("answers a device sending drive with error wrong_role", async () => {
    const device = await openSocket(`/ws/device/${env.CAR_ID}`, {
      Authorization: "Bearer test-device-token",
    });
    const reply = nextMessage(device);
    device.send(
      '{"v":1,"type":"drive","session_id":"kQ3v9XbT2mWc7ZyH4nPdLe","seq":1,"freshness_token":"4250.t7nkPssPxLNf4a4O89y7DQhNqVnaAenJIhSZtVN2L-8","left":0,"right":0}',
    );
    expect(await reply).toEqual({ v: 1, type: "error", reason: "wrong_role", request_id: null });
    device.close(1000);
  });

  it("echoes request_id of a schema-valid arm rejected for the lease", async () => {
    const panel = await openPanel();
    const reply = nextMessage(panel);
    panel.send('{"v":1,"type":"arm","request_id":"Zm9vYmFyYmF6cXV4MTIzNA"}');
    expect(await reply).toEqual({
      v: 1,
      type: "error",
      reason: "lease_mismatch",
      request_id: "Zm9vYmFyYmF6cXV4MTIzNA",
    });
    panel.close(1000);
  });

  it("answers a binary frame with error invalid_message", async () => {
    const panel = await openPanel();
    const reply = nextMessage(panel);
    panel.send(new Uint8Array([123, 125]));
    expect(await reply).toMatchObject({ reason: "invalid_message" });
    panel.close(1000);
  });
});
