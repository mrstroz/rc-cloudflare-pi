import { DurableObject } from "cloudflare:workers";
import { DriverLease, type Effect } from "./lease";
import { RateWindows, receive, type Message, type Party } from "./receive";

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

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
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
  private readonly lease = new DriverLease<Connection>({ now: () => Date.now(), newId });
  private leaseTimer: ReturnType<typeof setTimeout> | null = null;

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
      if (this.panels.delete(connection)) {
        this.apply(this.lease.gone(connection, this.device !== null));
      }
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
    this.apply(this.lease.expire(this.device !== null));
    const verdict =
      typeof data === "string"
        ? receive(data, {
            from: connection.party,
            to: "server",
            nowMs: Date.now(),
            rates: connection.rates,
            holdsLease: this.lease.holds(connection),
          })
        : ({ ok: false, reason: "invalid_message", requestId: null } as const);
    if (verdict.ok) {
      this.onMessage(connection, verdict.message);
      return;
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

  /** Lease events of 03 §5; forwarding to the Pi and back comes with RC-28. */
  private onMessage(connection: Connection, message: Message): void {
    const deviceConnected = this.device !== null;
    if (connection.party === "panel") {
      if (message.type === "hello") {
        this.apply(this.lease.hello(connection, deviceConnected));
      } else if (message.type === "heartbeat" || message.type === "drive") {
        this.lease.renew(connection);
        this.armLeaseTimer();
      }
    } else if (message.type === "stopped") {
      this.apply(this.lease.stopped(message.request_id as string | null));
    }
  }

  private apply(effects: readonly Effect<Connection>[]): void {
    for (const effect of effects) {
      const text = JSON.stringify(effect.message);
      if (effect.to === "panel") {
        effect.tab.socket.send(text);
      } else if (effect.to === "device") {
        this.device?.socket.send(text);
      } else {
        for (const panel of this.panels) {
          if (panel !== effect.except) {
            panel.socket.send(text);
          }
        }
      }
    }
    this.armLeaseTimer();
  }

  /** One timer for the nearest lease deadline; messages also apply deadlines on arrival. */
  private armLeaseTimer(): void {
    if (this.leaseTimer !== null) {
      clearTimeout(this.leaseTimer);
      this.leaseTimer = null;
    }
    const deadline = this.lease.nextDeadline();
    if (deadline !== null) {
      this.leaseTimer = setTimeout(
        () => {
          this.leaseTimer = null;
          this.apply(this.lease.expire(this.device !== null));
        },
        Math.max(0, deadline - Date.now()),
      );
    }
  }

  /** Pi state is unknown from here until the first `status` of a new connection (03 §3). */
  private onDeviceDisconnected(connection: Connection): void {
    if (this.device === connection) {
      this.device = null;
    }
  }
}
