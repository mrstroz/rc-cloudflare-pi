import { DurableObject } from "cloudflare:workers";

/** One instance per `car_id` (docs/spec/03 §3). RC-24 gives it the device connection. */
export class CarObject extends DurableObject<Env> {
  override fetch(): Response {
    return new Response(null, { status: 404 });
  }
}
