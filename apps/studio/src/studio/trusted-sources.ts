import type { TrustStore } from "@halonicjs/ports";
import type { TrustedSource, TrustedSourcesHost } from "@halonicjs/studio-feature-workspace/api";

/** The last part of a path, which is the folder's name; both slash kinds count. */
function nameOf(location: string): string {
  const parts = location.split(/[\\/]+/u).filter((part) => part !== "");
  return parts.at(-1) ?? location;
}

/**
 * Settings › Trusted sources over the profile's trust records (`workspace.trusted-sources`). It
 * leaves `found` unknown: the page can't ask whether a folder is still there until the shell has a
 * command for it.
 */
export function trustedSourcesOf(store: TrustStore): TrustedSourcesHost {
  return {
    async list(): Promise<TrustedSource[]> {
      const records = await store.list();
      return records.map((record) => ({
        location: record.location,
        name: nameOf(record.location),
        trustedAt: record.grantedAt,
      }));
    },
    remove: (location) => store.revoke(location),
  };
}
