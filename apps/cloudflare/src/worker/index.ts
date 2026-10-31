export { CarObject } from "./car";

export default {
  fetch(request, env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
