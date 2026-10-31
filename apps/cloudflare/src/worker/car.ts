import { DurableObject } from "cloudflare:workers";
import { goesToDriver, isForwarded, toDevice } from "./forward";
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
 * WebSockets without hibernation (ADR-0007), so losing the instance ends control. Beside the
 * lease it keeps only the open connections; every message is forwarded at once or rejected.
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
    this.listen(connection, () => {
      if (this.panels.delete(connection)) {
        this.apply(this.lease.gone(connection, this.device !== null));
      }
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  private acceptDevice(): Response {
    const { client, connection } = connect("device");
    const previous = this.device;
    if (previous !== null) {
      previous.socket.close(CLOSE_REPLACED, "replaced");
      this.onDeviceGone(previous);
    }
    this.device = connection;
    this.broadcast(deviceLink(true));
    this.listen(connection, () => {
      this.onDeviceGone(connection);
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Pi state is unknown from here until the first `status` of a new connection (03 §3). */
  private onDeviceGone(connection: Connection): void {
    if (this.device !== connection) {
      return;
    }
    this.device = null;
    this.broadcast(deviceLink(false));
    this.apply(this.lease.deviceGone());
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
    if (!verdict.ok) {
      send(connection, {
        v: 1,
        type: "error",
        reason: verdict.reason,
        request_id: verdict.requestId,
      });
    } else if (connection.party === "panel") {
      this.fromPanel(connection, verdict.message);
    } else {
      this.fromDevice(verdict.message);
    }
  }

  /** 03 §5 and §7: lease events, and the driver's commands straight on to the Pi. */
  private fromPanel(tab: Connection, message: Message): void {
    if (message.type === "hello") {
      send(tab, deviceLink(this.device !== null));
      this.apply(this.lease.hello(tab, this.device !== null));
      return;
    }
    const leaseId = this.lease.leaseIdOf(tab);
    if (leaseId === null || !isForwarded(message.type)) {
      return;
    }
    if (message.type === "heartbeat" || message.type === "drive") {
      this.lease.renew(tab);
      this.armLeaseTimer();
    }
    if (this.device !== null) {
      send(this.device, toDevice(message.type, message, leaseId));
    }
  }

  /** Answers and telemetry of the Pi go to the driver unchanged (03 §7). */
  private fromDevice(message: Message): void {
    const driver = [...this.panels].find((tab) => this.lease.holds(tab));
    if (driver !== undefined && goesToDriver(message.type)) {
      send(driver, message);
    }
    if (message.type === "stopped") {
      const requestId = message.request_id;
      this.apply(this.lease.stopped(typeof requestId === "string" ? requestId : null));
    }
  }

  private broadcast(message: object): void {
    for (const tab of this.panels) {
      send(tab, message);
    }
  }

  private apply(effects: readonly Effect<Connection>[]): void {
    for (const effect of effects) {
      if (effect.to === "device") {
        if (this.device !== null) {
          send(this.device, effect.message);
        }
      } else if (effect.to === "panel") {
        send(effect.tab, effect.message);
      } else {
        for (const tab of this.panels) {
          if (tab !== effect.except) {
            send(tab, effect.message);
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
}

function deviceLink(connected: boolean): object {
  return { v: 1, type: "device_link", connected };
}

/**
 * A socket closed by the peer throws on `send` until its close event has run; the close
 * handler cleans up, so one dead connection must not stop the rest of the effects.
 */
function send(connection: Connection, message: object): void {
  try {
    connection.socket.send(JSON.stringify(message));
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }
  }
}
