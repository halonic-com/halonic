// The bridge's Web-only entry point, for a runtime without Node such as the
// Cloudflare Worker. Everything it exports, and everything it imports,
// uses only Web-standard APIs; `run-credential.test.ts` keeps it that way.

export { defaultBridgeLimits, defaultUpstreamLimits } from "./bridge-routes.ts";
export type { Fetch, UpstreamLimits } from "./pass-through.ts";
export {
  type RunCredentialBinding,
  type RunCredentialCheck,
  type RunCredentialRefusal,
  type RunCredentialStore,
  RunCredentials,
  type RunCredentialsOptions,
  type StoredRunCredential,
} from "./run-credential.ts";
export type { BodyLimits } from "./web-body.ts";
export {
  type WebBridgeExchange,
  WebHarnessBridge,
  type WebHarnessBridgeOptions,
} from "./web-bridge.ts";
