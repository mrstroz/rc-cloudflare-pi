import { isAllowedOrigin, isAuthorizedDevice, isAuthorizedOperator } from "./auth";
import { DEVICE_PATH, PANEL_PATH } from "./car";

export { CarObject } from "./car";

type RouteHandler = (request: Request, carId: string, env: Env) => Promise<Response>;

function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

function toCar(request: Request, carId: string, path: string, env: Env): Promise<Response> {
  return env.CAR.getByName(carId).fetch(new Request(new URL(path, request.url), request));
}

const upgradeRequired = (): Response => new Response("WebSocket upgrade required", { status: 426 });
const unauthorized = (): Response => new Response("Unauthorized", { status: 401 });

async function connectDevice(request: Request, carId: string, env: Env): Promise<Response> {
  if (!isWebSocketUpgrade(request)) {
    return upgradeRequired();
  }
  if (!(await isAuthorizedDevice(request, carId, env))) {
    return unauthorized();
  }
  return toCar(request, carId, DEVICE_PATH, env);
}

async function connectPanel(request: Request, carId: string, env: Env): Promise<Response> {
  if (!isWebSocketUpgrade(request)) {
    return upgradeRequired();
  }
  if (!(await isAuthorizedOperator(request, env))) {
    return unauthorized();
  }
  if (!isAllowedOrigin(request, env)) {
    return new Response("Forbidden origin", { status: 403 });
  }
  if (carId !== env.CAR_ID) {
    return new Response("Unknown car", { status: 404 });
  }
  return toCar(request, carId, PANEL_PATH, env);
}

/** `car_id` uses the base64url alphabet of protocol ids, so it needs no percent-decoding. */
const ROUTES: readonly (readonly [RegExp, RouteHandler])[] = [
  [/^\/ws\/device\/([A-Za-z0-9_-]+)$/, connectDevice],
  [/^\/ws\/panel\/([A-Za-z0-9_-]+)$/, connectPanel],
];

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    for (const [pattern, handler] of ROUTES) {
      const carId = pattern.exec(pathname)?.[1];
      if (carId !== undefined) {
        return handler(request, carId, env);
      }
    }
    if (!(await isAuthorizedOperator(request, env))) {
      return unauthorized();
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
