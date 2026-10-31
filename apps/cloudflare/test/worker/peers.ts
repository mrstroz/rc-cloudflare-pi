import { env } from "cloudflare:workers";
import { expect } from "vitest";
import { DEVICE_PATH, PANEL_PATH } from "../../src/worker/car";
import { receive, type Message, type Party } from "../../src/worker/receive";

/**
 * One end of a connection to a CarObject, opened on the DO directly so each test gets its own
 * instance. Every frame the DO sends is checked against the contract for its hop.
 */
export class Peer {
  private readonly inbox: Message[] = [];
  private waiters: ((message: Message) => void)[] = [];

  constructor(
    readonly socket: WebSocket,
    private readonly party: Exclude<Party, "server">,
  ) {
    socket.addEventListener("message", (event) => {
      const verdict = receive(event.data as string, { from: "server", to: party, nowMs: 0 });
      expect(verdict, `DO sent ${String(event.data)} to the ${party}`).toMatchObject({ ok: true });
      if (verdict.ok) {
        const waiter = this.waiters.shift();
        if (waiter === undefined) {
          this.inbox.push(verdict.message);
        } else {
          waiter(verdict.message);
        }
      }
    });
  }

  send(message: object): void {
    this.socket.send(JSON.stringify({ v: 1, ...message }));
  }

  /** The next message from the DO, failing after `timeoutMs`. */
  next(timeoutMs = 1000): Promise<Message> {
    const queued = this.inbox.shift();
    if (queued !== undefined) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new Error(`no message for the ${this.party} within ${String(timeoutMs)} ms`));
      }, timeoutMs);
      const waiter = (message: Message): void => {
        clearTimeout(timer);
        resolve(message);
      };
      this.waiters.push(waiter);
    });
  }

  /** Resolves true when nothing arrives within `ms`. */
  async silentFor(ms: number): Promise<boolean> {
    try {
      const message = await this.next(ms);
      this.inbox.unshift(message);
      return false;
    } catch {
      return true;
    }
  }

  close(): void {
    this.socket.close(1000);
  }
}

export class Car {
  private readonly stub = env.CAR.getByName(crypto.randomUUID());

  private async open(path: string, party: Exclude<Party, "server">): Promise<Peer> {
    const response = await this.stub.fetch(`https://car${path}`, {
      headers: { Upgrade: "websocket" },
    });
    const socket = response.webSocket;
    if (socket === null) {
      throw new Error(`no WebSocket from ${path}`);
    }
    socket.accept();
    return new Peer(socket, party);
  }

  panel(): Promise<Peer> {
    return this.open(PANEL_PATH, "panel");
  }

  device(): Promise<Peer> {
    return this.open(DEVICE_PATH, "device");
  }
}
