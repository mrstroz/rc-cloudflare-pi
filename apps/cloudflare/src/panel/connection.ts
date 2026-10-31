import { DriveControl } from "./control";
import type { Wheels } from "./inputs";

export const RECONNECT_DELAY_MS = 1000;

const BROWSER_CLOCK = {
  now: () => performance.now(),
  visible: () => document.visibilityState === "visible",
};

/** The car the panel drives; v1 has one, named in the page address (`?car=`) or `car-1`. */
export function carIdFromLocation(location: Location): string {
  return new URLSearchParams(location.search).get("car") ?? "car-1";
}

export function panelSocketUrl(location: Location, carId: string): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/ws/panel/${encodeURIComponent(carId)}`;
}

/**
 * Keeps one WebSocket to the DO open and gives each socket a fresh DriveControl, so a
 * reconnect restores the link and never the drive (03 §7, 04 §3). `onControl` receives the
 * controller to show; the caller makes it reactive.
 */
export function connectPanel(
  url: string,
  wheels: () => Wheels,
  onControl: (control: DriveControl | null) => DriveControl | null,
): () => void {
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let socket: WebSocket | null = null;

  const open = (): void => {
    const current = new WebSocket(url);
    socket = current;
    let control: DriveControl | null = null;
    current.addEventListener("open", () => {
      control = onControl(new DriveControl(current, wheels, BROWSER_CLOCK));
      control?.opened();
    });
    current.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        control?.receive(event.data);
      }
    });
    current.addEventListener("close", () => {
      control?.closed();
      onControl(null);
      if (!stopped) {
        retry = setTimeout(open, RECONNECT_DELAY_MS);
      }
    });
  };

  open();
  return () => {
    stopped = true;
    if (retry !== null) {
      clearTimeout(retry);
    }
    socket?.close(1000);
  };
}
