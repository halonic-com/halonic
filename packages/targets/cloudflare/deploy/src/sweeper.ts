import type { CloudflareApi, ResourceKind } from "./api.ts";

/** What the live-test sweeper (ADR 5.9) lists and deletes. Structurally the sweeper's `LiveSweeper`. */
export interface CloudflareSweeper {
  readonly target: "cloudflare";
  list(): Promise<readonly { kind: ResourceKind; name: string; createdAt: Date }[]>;
  destroy(resource: { kind: string; name: string }): Promise<void>;
}

const kinds: readonly ResourceKind[] = ["worker", "bucket", "database"];

/**
 * The sweeper's view of one Cloudflare account. It lists only names that start with `prefix`
 * and refuses to delete any other, so a wrong call can't reach a real deployment. Workers are
 * listed first so they stop serving before their data goes.
 */
export function cloudflareSweeper(
  api: CloudflareApi,
  accountId: string,
  prefix = "hlt-",
): CloudflareSweeper {
  return {
    target: "cloudflare",
    async list() {
      const found = [];
      for (const kind of kinds) {
        for (const r of await api.listResources(accountId, kind, prefix)) {
          found.push({ kind: r.kind, name: r.name, createdAt: new Date(r.createdAt) });
        }
      }
      return found;
    },
    async destroy(resource) {
      const kind = kinds.find((k) => k === resource.kind);
      if (!kind || !resource.name.startsWith(prefix)) {
        throw new RangeError(`not a live test resource: ${resource.kind} ${resource.name}`);
      }
      await api.deleteResource(accountId, { kind, name: resource.name });
    },
  };
}
