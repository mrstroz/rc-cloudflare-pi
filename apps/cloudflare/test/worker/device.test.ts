import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { CLOSE_REPLACED } from "../../src/worker/car";

const TOKEN = "test-device-token";

function connect(path: string, headers: Record<string, string>): Promise<Response> {
  return exports.default.fetch(`https://rc.example${path}`, {
    headers: { Upgrade: "websocket", ...headers },
  });
}

function connectDevice(token: string, carId: string = env.CAR_ID): Promise<Response> {
  return connect(`/ws/device/${carId}`, { Authorization: `Bearer ${token}` });
}

function acceptedSocket(response: Response): WebSocket {
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (socket === null) {
    throw new Error("expected a WebSocket in the 101 response");
  }
  socket.accept();
  return socket;
}

function nextClose(socket: WebSocket): Promise<CloseEvent> {
  return new Promise((resolve) => {
    socket.addEventListener("close", resolve, { once: true });
  });
}

describe("device connection", () => {
  it.each([
    ["wrong token", { Authorization: "Bearer not-the-token" }],
    ["no token", {}],
    ["not a bearer token", { Authorization: TOKEN }],
  ])("rejects %s with 401 before the upgrade", async (_name, headers) => {
    const response = await connect(`/ws/device/${env.CAR_ID}`, headers);
    expect(response.status).toBe(401);
    expect(response.webSocket).toBeNull();
  });

  it("rejects an unknown car_id with the same 401 as a bad token", async () => {
    const response = await connectDevice(TOKEN, "other-car");
    expect(response.status).toBe(401);
  });

  it("requires a WebSocket upgrade", async () => {
    const response = await exports.default.fetch(`https://rc.example/ws/device/${env.CAR_ID}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(response.status).toBe(426);
  });

  it("accepts a valid token", async () => {
    const socket = acceptedSocket(await connectDevice(TOKEN));
    socket.close(1000);
  });

  it("closes the older connection when a second valid one arrives", async () => {
    const first = acceptedSocket(await connectDevice(TOKEN));
    const firstClosed = nextClose(first);
    const second = acceptedSocket(await connectDevice(TOKEN));

    const event = await firstClosed;
    expect(event.code).toBe(CLOSE_REPLACED);
    expect(event.reason).toBe("replaced");

    let secondClosed = false;
    second.addEventListener("close", () => {
      secondClosed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(secondClosed).toBe(false);
    second.close(1000);
  });
});
