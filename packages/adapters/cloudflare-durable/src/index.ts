/**
 * Public entry point of `@halonicjs/adapter-cloudflare-durable`: the
 * `Coordination` port in a Cloudflare Durable Object. So far the logic
 * ({@link CoordinationState}) over a storage it is given; the Durable Object
 * class and the client for the Worker follow.
 */
export {
  CoordinationState,
  type StateStorage,
  type StateTransaction,
} from "./coordination-state.ts";
