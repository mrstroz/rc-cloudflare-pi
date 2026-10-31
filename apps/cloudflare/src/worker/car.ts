import { DurableObject } from "cloudflare:workers";
import { RateWindows, receive, type Party } from "./receive";

/** Paths on which the Worker hands an authenticated connection to the object. */
export const DEVICE_PATH = "/device";
export const PANEL_PATH = "/panel";

/** Close code for a device connection replaced by a newer one (ADR-0012). */
export const CLOSE_REPLACED = 4001;

/** One WebSocket with what the DO keeps per connection: its sender role and rate windows. */
interface Connection {
  readonly socket: WebSocket;
  readonly party: Exclude<Party, "server">;
  readonly rates: RateWindows;
}

function connect(party: Connection["party"]): { client: WebSocket; connection: Connection } {
  const { 0: client, 1: socket } = new WebSocketPair();
  socket.accept();
  return { client, connection: { socket, party, rates: new RateWindows() } };
}

/**
 * One instance per `car_id` (docs/spec/03 §3). State lives only in memory: standard
 * WebSockets without hibernation (ADR-0007), so losing the instance ends control.
 */
export class CarObject extends DurableObject<Env> {
  private device: Connection | null = null;
  private readonly panels = new Set<Connection>();

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
    const { client, connection } = connect("panel");
    this.panels.add(connection);
    const forget = (): void => {
      this.panels.delete(connection);
    };
    this.listen(connection, forget);
    return new Response(null, { status: 101, webSocket: client });
  }

  private acceptDevice(): Response {
    const { client, connection } = connect("device");
    const previous = this.device;
    if (previous !== null) {
      previous.socket.close(CLOSE_REPLACED, "replaced");
      this.onDeviceDisconnected(previous);
    }
    this.device = connection;
    this.listen(connection, () => {
      this.onDeviceDisconnected(connection);
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  private listen(connection: Connection, onGone: () => void): void {
    connection.socket.addEventListener("message", (event) => {
      this.onFrame(connection, event.data);
    });
    connection.socket.addEventListener("close", onGone);
    connection.socket.addEventListener("error", onGone);
  }

  /** Validation of docs/spec/03 §4; a rejected frame gets `error` on the same connection. */
  private onFrame(connection: Connection, data: string | ArrayBuffer): void {
    const verdict =
      typeof data === "string"
        ? receive(data, {
            from: connection.party,
            to: "server",
            nowMs: Date.now(),
            rates: connection.rates,
            holdsLease: false,
          })
        : ({ ok: false, reason: "invalid_message", requestId: null } as const);
    if (verdict.ok) {
      return; // Lease (RC-27) and forwarding (RC-28) act on accepted messages.
    }
    connection.socket.send(
      JSON.stringify({
        v: 1,
        type: "error",
        reason: verdict.reason,
        request_id: verdict.requestId,
      }),
    );
  }

  /** Pi state is unknown from here until the first `status` of a new connection (03 §3). */
  private onDeviceDisconnected(connection: Connection): void {
    if (this.device === connection) {
      this.device = null;
    }
  }
}
