// Where a checkout's lockfile says packages come from. The lockfile is
// written by the sandboxed program, and the next install fetches whatever it
// names from the host, which would let the sandbox send data out in a
// request. So only the pinned registry, and the one other host our own
// lockfile uses, may be named.

/** Other places a lockfile may download from: the Node runtime that `pnpm` can fetch as a dependency. */
const otherDownloadPrefixes = [
  "https://nodejs.org/download/release/",
  "https://unofficial-builds.nodejs.org/download/release/",
];

/** The resolution types a lockfile may hold: a registry package has none. */
const allowedResolutionTypes = new Set(["directory", "variations", "binary"]);

/** The address with the trailing slash that makes "starts with" mean "is under". */
export function registryPrefix(registry: string): string {
  return registry.endsWith("/") ? registry : `${registry}/`;
}

/**
 * Refuses a lockfile document with a package that would come from anywhere
 * but the pinned registry: a `git` source, a tarball or download address on
 * another host, or a type this check doesn't know. A resolution with only an
 * integrity hash names no address; pnpm builds it from the pinned registry.
 *
 * @throws Error naming the file and the address or type
 */
export function refuseRemoteSources(data: Record<string, unknown>, registry: string): void {
  const packages = isRecord(data["packages"]) ? data["packages"] : {};
  for (const entry of Object.values(packages)) {
    if (isRecord(entry)) refuseRemoteResolution(entry["resolution"], registry);
  }
}

/**
 * Refuses every `registries` setting that names a registry other than the
 * pinned one, since a package of that scope would be fetched from there.
 *
 * @throws Error naming the setting and the address
 */
export function refuseOtherRegistries(registries: unknown, registry: string): void {
  if (!isRecord(registries)) return;
  const pinned = registryPrefix(registry);
  for (const [scope, address] of Object.entries(registries)) {
    if (typeof address !== "string" || registryPrefix(address) !== pinned) {
      throw new Error(
        `The checkout's pnpm-workspace.yaml sets the registry of ${scope} to ${String(address)}, which isn't ${registry}.`,
      );
    }
  }
}

function refuseRemoteResolution(resolution: unknown, registry: string): void {
  if (!isRecord(resolution)) return;
  refuseUnknownSource(resolution);
  if (Array.isArray(resolution["variants"])) {
    for (const variant of resolution["variants"]) {
      if (isRecord(variant)) refuseRemoteResolution(variant["resolution"], registry);
    }
  }
  refuseOtherHosts(resolution, registry);
}

function refuseUnknownSource(resolution: Record<string, unknown>): void {
  const type = resolution["type"];
  if (type !== undefined && (typeof type !== "string" || !allowedResolutionTypes.has(type))) {
    throw new Error(
      `The checkout's pnpm-lock.yaml has a ${String(type)} source, which is refused.`,
    );
  }
  if (typeof resolution["repo"] === "string") {
    throw new Error("The checkout's pnpm-lock.yaml has a git source, which is refused.");
  }
}

function refuseOtherHosts(resolution: Record<string, unknown>, registry: string): void {
  const allowed = [registryPrefix(registry), ...otherDownloadPrefixes];
  for (const key of ["tarball", "url"]) {
    const address = resolution[key];
    // A `file:` tarball is a local path, which the path check handles.
    if (typeof address !== "string" || address.startsWith("file:")) continue;
    if (!allowed.some((prefix) => address.startsWith(prefix))) {
      throw new Error(
        `The checkout's pnpm-lock.yaml downloads from ${address}, which isn't the registry ${registry}.`,
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
