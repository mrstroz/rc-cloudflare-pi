import { DurableObject } from "cloudflare:workers";

/** Path on which the Worker hands an authenticated device connection to the object. */
export const DEVICE_PATH = "/device";

/** Close code for a device connection replaced by a newer one (ADR-0012). */
export const CLOSE_REPLACED = 4001;

/**
 * One instance per `car_id` (docs/spec/03 §3). State lives only in memory: standard
 * WebSockets without hibernation (ADR-0007), so losing the instance ends control.
 */
export class CarObject extends DurableObject<Env> {
  private device: WebSocket | null = null;

  override fetch(request: Request): Response {
    if (new URL(request.url).pathname === DEVICE_PATH) {
      return this.acceptDevice();
    }
    return new Response(null, { status: 404 });
  }

  private acceptDevice(): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    const previous = this.device;
    if (previous !== null) {
      previous.close(CLOSE_REPLACED, "replaced");
      this.onDeviceDisconnected(previous);
    }
    this.device = server;
    server.addEventListener("close", () => {
      this.onDeviceDisconnected(server);
    });
    server.addEventListener("error", () => {
      this.onDeviceDisconnected(server);
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Pi state is unknown from here until the first `status` of a new connection (03 §3). */
  private onDeviceDisconnected(socket: WebSocket): void {
    if (this.device === socket) {
      this.device = null;
    }
  }
}
