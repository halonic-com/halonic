import type { HttpClient, IntegrationHost, Secrets, TokenStore } from "@halonicjs/ports";
import { createLimitedHttpClient, type RequestLimits } from "./limited-http.ts";
import type { IntegrationPolicy } from "./policy.ts";
import { RequestLog } from "./request-log.ts";
import { scopedTokens } from "./scoped-tokens.ts";
import { integrationWait } from "./wait.ts";

/** What {@link createIntegrationHost} needs: the raw ports, which the integration never sees. */
export interface IntegrationHostOptions {
  readonly policy: IntegrationPolicy;
  readonly transport: HttpClient;
  readonly secrets: Secrets;
  readonly tokens: TokenStore;
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly limits?: RequestLimits;
  readonly now?: () => number;
}

/** The host for one integration, and its request log, which only Halonic reads. */
export interface CreatedIntegrationHost {
  readonly host: IntegrationHost;
  readonly log: RequestLog;
}

/**
 * Builds the `IntegrationHost` for one integration from the raw ports. The
 * integration gets the host; Halonic keeps the log.
 *
 * @example
 * const { host, log } = createIntegrationHost({ policy, transport: { fetch }, secrets, tokens });
 * const connection = weather.connect(host);
 */
export function createIntegrationHost(options: IntegrationHostOptions): CreatedIntegrationHost {
  const log = new RequestLog();
  const http = createLimitedHttpClient({
    policy: options.policy,
    transport: options.transport,
    secrets: options.secrets,
    log,
    ...(options.limits ? { limits: options.limits } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  const host: IntegrationHost = Object.freeze({
    http: Object.freeze(http),
    tokens: Object.freeze(scopedTokens(options.policy, options.tokens)),
    settings: Object.freeze({ ...options.settings }),
    wait: integrationWait,
  });
  return { host, log };
}
