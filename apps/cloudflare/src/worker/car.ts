import { DurableObject } from "cloudflare:workers";

/** Paths on which the Worker hands an authenticated connection to the object. */
export const DEVICE_PATH = "/device";
export const PANEL_PATH = "/panel";

/** Close code for a device connection replaced by a newer one (ADR-0012). */
export const CLOSE_REPLACED = 4001;

/**
 * One instance per `car_id` (docs/spec/03 §3). State lives only in memory: standard
 * WebSockets without hibernation (ADR-0007), so losing the instance ends control.
 */
export class CarObject extends DurableObject<Env> {
  private device: WebSocket | null = null;
  private readonly panels = new Set<WebSocket>();

  override fetch(request: Request): Response {
    switch (new URL(request.url).pathname) {
      case DEVICE_PATH:
        return this.acceptDevice();
      case PANEL_PATH:
        return this.acceptPanel();
      default:
        return new Response(null, { status: 404 });
    }
  }

  private acceptPanel(): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    this.panels.add(server);
    const forget = (): void => {
      this.panels.delete(server);
    };
    server.addEventListener("close", forget);
    server.addEventListener("error", forget);
    return new Response(null, { status: 101, webSocket: client });
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
