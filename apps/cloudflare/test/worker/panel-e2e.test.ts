import { expect, it } from "vitest";
import { DriveControl } from "../../src/panel/core/control";
import { Car } from "./peers";

/** Waits until `check` holds, giving the DO and the sockets turns in between. */
async function until(check: () => boolean, rounds = 200): Promise<void> {
  for (let round = 0; !check(); round += 1) {
    if (round === rounds) {
      throw new Error(`condition not reached: ${check.toString()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

it("the panel's controller arms the car through the DO and drives with the newest token", async () => {
  const car = new Car();
  const pi = await car.device();
  const tab = await car.panel();
  const wheels = { left: 0, right: 0 };
  const socket = {
    send: (text: string) => {
      tab.socket.send(text);
    },
    bufferedAmount: 0,
  };
  const control = new DriveControl(socket, () => wheels, { now: Date.now, visible: () => true });
  tab.onMessage((frame) => {
    control.receive(frame);
  });
  control.opened();

  const grantStop = await pi.nextOf("stop");
  pi.send({ type: "stopped", request_id: grantStop.request_id, cause: null });
  await until(() => control.lease === "granted");
  expect(control.status).toBe("ready");

  control.arm();
  const arm = await pi.nextOf("arm");
  expect(arm).toMatchObject({ type: "arm", lease_id: grantStop.lease_id });
  pi.send({
    type: "armed",
    request_id: arm.request_id,
    session_id: "kQ3v9XbT2mWc7ZyH4nPdLe",
    freshness_token: "4200.kF7FLu2kWOb_gvVlpETLkCxjMa91_w7RYdLoyLNS5Rw",
  });
  await until(() => control.status === "active");
  pi.send({
    type: "control_token",
    session_id: "kQ3v9XbT2mWc7ZyH4nPdLe",
    freshness_token: "4250.t7nkPssPxLNf4a4O89y7DQhNqVnaAenJIhSZtVN2L-8",
  });
  await until(() => control.session?.token.startsWith("4250.") === true);
  wheels.left = 0.5;

  let drive = await pi.nextOf("drive");
  while (drive.freshness_token !== "4250.t7nkPssPxLNf4a4O89y7DQhNqVnaAenJIhSZtVN2L-8") {
    drive = await pi.nextOf("drive");
  }
  expect(drive).toMatchObject({ type: "drive", left: 0.5, lease_id: grantStop.lease_id });

  pi.send({
    type: "status",
    state: "disarmed",
    session_id: null,
    last_seq: null,
    seq_age_ms: null,
    command_left: null,
    command_right: null,
    output_left: null,
    output_right: null,
    stop_cause: "watchdog_timeout",
    lease_id: grantStop.lease_id,
    last_heartbeat_seq: null,
    heartbeat_age_ms: null,
  });
  await until(() => control.status === "stopped");
  expect(control.stopCause).toBe("watchdog_timeout");
  control.closed();
  tab.close();
});
