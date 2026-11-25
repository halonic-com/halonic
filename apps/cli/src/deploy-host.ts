// The one way a `halonic deploy` subcommand gets the deploy app service on
// this computer: the target loaded by name (ADR 5.6), and what it's created
// with. It reaches only Cloudflare's API and the deployment's own workers.dev
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
import type { OpenWorkspaceHistory } from "./run-workspace.ts";

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
  /** Opens the workspace's git history; the hardened git on the `PATH` by default. */
  readonly openHistory?: OpenWorkspaceHistory;
}

/**
 * The deploy app service for this computer, for the deployment whose Worker
 * is `worker` in `deployments.yaml`: its target reaches no other Worker.
 */
export function deployServiceOf(setup: DeploySetup, worker: string | undefined): DeployService {
  if (setup.deploys !== undefined) return setup.deploys;
  const environment = setup.environment ?? process.env;
  const hostClass = deployHostClass(worker);
  const context: DeployTargetContext = {
    http: setup.http ?? createNodeHttpClient({ hostClass, proxy: proxySetting }),
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
 * The hosts a deploy target may reach: Cloudflare's API, and the
 * deployment's own workers.dev address, `<worker>.<account's subdomain>.workers.dev`,
 * for its health and self-test (Liam's note 1 on HAL-6702). The subdomain is
 * the account's and only Cloudflare knows it, so any one label stands there.
 * Without a Worker, no workers.dev address. Over https only; any other host is
 * refused before it's looked up.
 */
export function deployHostClass(worker: string | undefined): (url: URL) => "public" | undefined {
  return (url) => {
    if (url.protocol !== "https:") return undefined;
    const host = url.hostname;
    if (host === "api.cloudflare.com") return "public";
    const [name, subdomain, ...rest] = host.split(".");
    const own =
      worker !== undefined &&
      name === worker &&
      subdomain !== undefined &&
      subdomain !== "" &&
      rest.join(".") === "workers.dev";
    return own ? "public" : undefined;
  };
}
