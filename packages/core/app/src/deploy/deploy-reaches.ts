import type { Connector, Provider } from "@halonicjs/format";
import type { DeployReach } from "@halonicjs/ports";
import { agentsTrustContent, filesOf, type LoadedWorkspace, trustUrl } from "@halonicjs/workspace";

/** One thing in the workspace that can't run on Cloudflare, with the file that says it. */
export interface CloudflareProblem {
  /** The workspace-relative path of the file, such as `providers/ollama.yaml`. */
  readonly path: string;
  /** One sentence, such as "The connector files starts a program, and Cloudflare can't start programs." */
  readonly reason: string;
}

/**
 * What a deployment on Cloudflare would reach from the workspace's files: the
 * whole list, or why it can't be deployed. Never part of a list.
 */
export type DeployReaches =
  | {
      readonly kind: "reaches";
      /** Each address once per secret, sorted by address, then by secret. */
      readonly reaches: readonly DeployReach[];
      /** Every secret the providers and connectors name, sorted, each once. */
      readonly secretNames: readonly string[];
    }
  | { readonly kind: "cannot-run"; readonly problems: readonly CloudflareProblem[] };

/** Where a provider of a type sends its requests when its file names no `baseUrl`. */
const providerHosts: Readonly<Record<string, string>> = {
  anthropic: "api.anthropic.com",
  openai: "api.openai.com",
};

/**
 * What a deployment would reach from Cloudflare, read from the workspace's
 * files (deploy flow 2.7 and 3.6; requirement `app.deploy-reaches`): every
 * model provider but the test model and every connector, with the secret it
 * sends there, by name only. The list is complete or there is none (C1,
 * condition 2): anything Halonic can't place on an internet address is a
 * problem instead, so the deploy stops rather than show part of the list.
 *
 * @example
 * deployReaches(workspace);
 * // { kind: "reaches", reaches: [{ address: "api.anthropic.com", secret: "anthropic-key" }], secretNames: ["anthropic-key"] }
 */
export function deployReaches(workspace: LoadedWorkspace): DeployReaches {
  const reaches: DeployReach[] = [];
  const problems: CloudflareProblem[] = [];
  const place = (path: string, found: DeployReach | string) => {
    if (typeof found === "string") problems.push({ path, reason: found });
    else reaches.push(found);
  };
  for (const file of filesOf(workspace, "provider")) {
    if (file.value.type !== "mock") place(file.path, providerReach(file.value));
  }
  for (const file of filesOf(workspace, "connector")) {
    place(file.path, connectorReach(file.value));
  }
  for (const file of filesOf(workspace, "agent")) {
    for (const agent of agentsTrustContent([file.value])) {
      place(
        file.path,
        `The agent ${agent.id} starts ${agent.harness}, and Cloudflare can't start programs.`,
      );
    }
  }
  if (problems.length > 0) {
    return { kind: "cannot-run", problems: problems.sort((a, b) => compare(a.path, b.path)) };
  }
  const unique = new Map(reaches.map((reach) => [`${reach.address} ${reach.secret}`, reach]));
  const secrets = new Set(reaches.flatMap((reach) => (reach.secret ? [reach.secret] : [])));
  return {
    kind: "reaches",
    reaches: [...unique.values()].sort(
      (a, b) => compare(a.address, b.address) || compare(a.secret ?? "", b.secret ?? ""),
    ),
    secretNames: [...secrets].sort(compare),
  };
}

function providerReach(provider: Provider): DeployReach | string {
  const where = provider.baseUrl ?? defaultUrl(provider.type);
  if (where === undefined) {
    return `The provider ${provider.id} names no address, so Halonic can't tell where it sends requests.`;
  }
  const host = hostOf(where);
  if (host === undefined) {
    return `The provider ${provider.id} has an address Halonic can't read.`;
  }
  if (provider.local || isLocalHost(host)) {
    return `The provider ${provider.id} is at ${host}, which Cloudflare can't reach.`;
  }
  return { address: host, secret: provider.secret };
}

function connectorReach(connector: Connector): DeployReach | string {
  const { transport } = connector;
  if ("stdio" in transport) {
    return `The connector ${connector.id} starts a program, and Cloudflare can't start programs.`;
  }
  if (!("http" in transport)) {
    return `The connector ${connector.id} runs on this computer, and Cloudflare can't run it.`;
  }
  const host = hostOf(transport.http.url);
  if (host === undefined) {
    return `The connector ${connector.id} has an address Halonic can't read.`;
  }
  if (connector.local === true || isLocalHost(host)) {
    return `The connector ${connector.id} is at ${host}, which Cloudflare can't reach.`;
  }
  return { address: host, secret: connector.secret };
}

/** The address a provider type uses on its own; `ollama` and `lmstudio` are on this computer. */
function defaultUrl(type: string): string | undefined {
  if (type === "ollama" || type === "lmstudio") return "http://localhost/";
  const host = providerHosts[type];
  return host === undefined ? undefined : `https://${host}/`;
}

/**
 * The host of an `http:` or `https:` address, lowercase and in ASCII, without
 * its port; `undefined` for anything `trustUrl` refuses or that isn't one.
 * The core has no `URL` class (plan 4.1), so it's read from `trustUrl`'s form.
 */
export function hostOf(address: string): string | undefined {
  const normalised = trustUrl(address);
  if ("refused" in normalised) return undefined;
  const match = /^https?:\/\/(\[[^\]]+\]|[^/:?#]+)(?::\d+)?\//u.exec(normalised.url);
  return match?.[1];
}

/** A host on this computer or a private network, which Cloudflare can't reach. */
function isLocalHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host.startsWith("[")) {
    // Loopback, unique local (fc00::/7) and link-local (fe80::/10).
    return host === "[::1]" || /^\[f[cd]|^\[fe[89ab]/u.test(host);
  }
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/** By code unit, so the order is the same on every machine. */
function compare(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
