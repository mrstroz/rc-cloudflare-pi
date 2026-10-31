import { isAuthorizedDevice } from "./auth";
import { DEVICE_PATH } from "./car";

export { CarObject } from "./car";

const DEVICE_ROUTE = /^\/ws\/device\/([^/]+)$/;

function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

async function connectDevice(request: Request, carId: string, env: Env): Promise<Response> {
  if (!isWebSocketUpgrade(request)) {
    return new Response("WebSocket upgrade required", { status: 426 });
  }
  if (!(await isAuthorizedDevice(request, carId, env))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const target = new URL(DEVICE_PATH, request.url);
  return env.CAR.getByName(carId).fetch(new Request(target, request));
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const device = DEVICE_ROUTE.exec(url.pathname);
    if (device?.[1] !== undefined) {
      return connectDevice(request, decodeURIComponent(device[1]), env);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
