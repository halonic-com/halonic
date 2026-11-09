import type { HttpClient } from "@halonicjs/ports";

/**
 * Recorded npm and PyPI answers for the connector pinning suite, so no test
 * reaches a real registry. The bodies keep the fields of the real answers
 * that a version lookup reads, trimmed of the rest:
 *
 * - npm: the package document at `{registryUrl}/{name}`, with a scoped
 *   name's `/` written as is or as `%2f` (any case).
 * - PyPI: the JSON API at `{registryUrl}/pypi/{name}/json` and
 *   `{registryUrl}/pypi/{name}/{version}/json`.
 *
 * Anything else answers 404.
 */

/** A package the recorded registries hold, and the versions they list. */
export interface RecordedPackage {
  name: string;
  versions: readonly string[];
}

/** A registry at one address and what it holds. */
export interface RecordedRegistry {
  kind: "npm" | "pypi";
  url: string;
  packages: readonly RecordedPackage[];
  /**
   * Set for a broken or tampered mirror: its answer for any version says it
   * is this version instead, so only a lookup that checks the answer notices.
   */
  claims?: string;
}

/** The public npm registry. */
export const npmRegistryUrl = "https://registry.npmjs.org";
/** The public PyPI. */
export const pypiRegistryUrl = "https://pypi.org";
/** A company's own npm mirror, as a user's profile may name it. */
export const npmMirrorUrl = "https://npm.acme.test/registry";

/** An npm mirror whose answers claim another version than the one asked for. */
export const npmTamperedUrl = "https://npm-tampered.acme.test";
/** A PyPI mirror whose answers claim another version than the one asked for. */
export const pypiTamperedUrl = "https://pypi-tampered.acme.test";

/** The npm package the suite pins, and the versions each registry lists for it. */
export const npmPackage: RecordedPackage = { name: "@acme/mail-mcp", versions: ["2.3.1", "3.0.0"] };
/** The PyPI package the suite pins. */
export const pypiPackage: RecordedPackage = { name: "mail-mcp", versions: ["2.3.1", "3.0.0"] };

/**
 * The registries the suite records, all holding the same packages: public
 * npm, public PyPI, an npm mirror, and an npm and a PyPI mirror whose
 * answers claim version 3.0.0 whatever was asked.
 */
export const recordedRegistries: readonly RecordedRegistry[] = [
  { kind: "npm", url: npmRegistryUrl, packages: [npmPackage] },
  { kind: "pypi", url: pypiRegistryUrl, packages: [pypiPackage] },
  { kind: "npm", url: npmMirrorUrl, packages: [npmPackage] },
  { kind: "npm", url: npmTamperedUrl, packages: [npmPackage], claims: "3.0.0" },
  { kind: "pypi", url: pypiTamperedUrl, packages: [pypiPackage], claims: "3.0.0" },
];

/**
 * An {@link HttpClient} that answers from {@link recordedRegistries} and
 * remembers every address it was asked for. With `down`, every request
 * fails the way an unreachable registry does.
 */
export class RecordedRegistryClient implements HttpClient {
  readonly #registries: readonly RecordedRegistry[];
  readonly #down: boolean;
  readonly #asked: string[] = [];

  constructor(options: { registries?: readonly RecordedRegistry[]; down?: boolean } = {}) {
    this.#registries = options.registries ?? recordedRegistries;
    this.#down = options.down ?? false;
  }

  async fetch(url: string, init?: RequestInit): Promise<Response> {
    this.#asked.push(url);
    if (this.#down) throw new TypeError(`fetch failed: ${url} can't be reached`);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") return answer(405, { error: "Method not allowed" });
    for (const registry of this.#registries) {
      const body = recordedAnswer(registry, url);
      if (body !== undefined) return answer(200, body);
    }
    return answer(404, { error: "Not found" });
  }

  /** Every address asked for so far, in order. */
  asked(): string[] {
    return [...this.#asked];
  }
}

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function recordedAnswer(registry: RecordedRegistry, url: string): unknown {
  const prefix = `${registry.url}/`;
  if (!url.startsWith(prefix)) return undefined;
  const path = url.slice(prefix.length).split(/[?#]/)[0] ?? "";
  return registry.kind === "npm" ? npmAnswer(registry, path) : pypiAnswer(registry, path);
}

function npmAnswer(registry: RecordedRegistry, path: string): unknown {
  const name = path.replace(/%2f/i, "/");
  const found = registry.packages.find((recorded) => recorded.name === name);
  if (found === undefined) return undefined;
  const latest = found.versions.at(-1);
  return {
    _id: found.name,
    name: found.name,
    "dist-tags": { latest },
    versions: Object.fromEntries(
      found.versions.map((version) => [
        version,
        {
          name: found.name,
          version: registry.claims ?? version,
          dist: { tarball: `${registry.url}/${found.name}/-/mail-mcp-${version}.tgz` },
        },
      ]),
    ),
  };
}

function pypiAnswer(registry: RecordedRegistry, path: string): unknown {
  const match = /^pypi\/([^/]+)\/(?:([^/]+)\/)?json$/.exec(path);
  if (match === null) return undefined;
  const [, name, version] = match;
  const found = registry.packages.find((recorded) => recorded.name === name);
  if (found === undefined) return undefined;
  if (version === undefined) {
    return {
      info: { name: found.name, version: found.versions.at(-1) },
      releases: Object.fromEntries(found.versions.map((listed) => [listed, [{ yanked: false }]])),
    };
  }
  if (!found.versions.includes(version)) return undefined;
  return {
    info: { name: found.name, version: registry.claims ?? version },
    urls: [{ yanked: false }],
  };
}
