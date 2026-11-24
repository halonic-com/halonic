// The one way a `halonic deploy` subcommand gets the deploy app service on
// this computer: the target loaded by name (ADR 5.6), and what it's created
// with. It reaches only Cloudflare's API and the deployment's workers.dev
// address, and takes the token from HALONIC_CLOUDFLARE_API_TOKEN (deploy flow
// 3.1). No token is saved yet: `halonic deploy login` brings the store.

import { hostname } from "node:os";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import { MemoryTokenStore } from "@halonicjs/adapter-memory";
import { createDeployService, type DeployService } from "@halonicjs/app";
import type { DeployTargetContext, HttpClient } from "@halonicjs/ports";
import { type Clock, systemClock } from "@halonicjs/std";
import { proxySetting } from "@halonicjs/target-node-harness";
import { type ImportPackage, loadDeployTarget } from "./deploy-target-loader.ts";

/** The environment variable a CI job sets the Cloudflare token in; it wins over a saved one. */
export const cloudflareTokenVariable = "HALONIC_CLOUDFLARE_API_TOKEN";

/** What `halonic deploy` uses on this computer, so tests can fix each part. */
export interface DeploySetup {
  /** The deploy app service; made from the parts below by default. */
  readonly deploys?: DeployService;
  /** The process environment by default. */
  readonly environment?: Readonly<Record<string, string | undefined>>;
  /** The system clock by default. */
  readonly clock?: Clock;
  /** An IANA time zone for the times it shows; the computer's own by default. */
  readonly timeZone?: string;
  /** `import()` by default. */
  readonly importPackage?: ImportPackage;
  /** Reaches only {@link deployHostClass}'s hosts by default. */
  readonly http?: HttpClient;
}

/** The deploy app service for this computer. */
export function deployServiceOf(setup: DeploySetup): DeployService {
  if (setup.deploys !== undefined) return setup.deploys;
  const environment = setup.environment ?? process.env;
  const context: DeployTargetContext = {
    http: setup.http ?? createNodeHttpClient({ hostClass: deployHostClass, proxy: proxySetting }),
    tokens: new MemoryTokenStore(),
    environmentToken: environment[cloudflareTokenVariable],
    // Who holds the lock; the deploy that takes one puts the git email first.
    who: hostname(),
  };
  return createDeployService({
    loadTarget: (host) => loadDeployTarget(host, context, setup.importPackage),
    clock: setup.clock ?? systemClock,
    ...(setup.timeZone === undefined ? {} : { timeZone: setup.timeZone }),
  });
}

/**
 * The hosts a deploy target may reach: Cloudflare's API, and a Worker's
 * workers.dev address for its health. Over https only; any other host is
 * refused before it's looked up.
 */
export function deployHostClass(url: URL): "public" | undefined {
  if (url.protocol !== "https:") return undefined;
  const host = url.hostname;
  return host === "api.cloudflare.com" || host.endsWith(".workers.dev") ? "public" : undefined;
}
