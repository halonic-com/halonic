import type { TrustStore } from "@halonicjs/ports";
import type { TrustedSource, TrustedSourcesHost } from "@halonicjs/studio-feature-workspace/api";

/** The last part of a path, which is the folder's name; both slash kinds count. */
function nameOf(location: string): string {
  const parts = location.split(/[\\/]+/u).filter((part) => part !== "");
  return parts.at(-1) ?? location;
}

/** Whether each folder is still there, by location; one left out is unknown. */
export type FoldersFound = (locations: readonly string[]) => Promise<ReadonlyMap<string, boolean>>;

/**
 * Settings › Trusted sources over the profile's trust records (`workspace.trusted-sources`). With
 * `foldersFound` a row says whether its folder is still there; without it, or when it fails, `found`
 * stays unknown and the row only says when it was trusted. Once a record is removed, `afterRemove` runs, so the folders open now check their
 * trust again and a removed trust holds no longer, without waiting for a save.
 */
export function trustedSourcesOf(
  store: TrustStore,
  afterRemove: () => Promise<void> = async () => undefined,
  foldersFound?: FoldersFound,
): TrustedSourcesHost {
  return {
    async list(): Promise<TrustedSource[]> {
      const records = await store.list();
      const found = await foundOf(
        foldersFound,
        records.map((record) => record.location),
      );
      return records.map((record) => ({
        location: record.location,
        name: nameOf(record.location),
        trustedAt: record.grantedAt,
        found: found.get(record.location),
      }));
    },
    async remove(location): Promise<void> {
      await store.revoke(location);
      await afterRemove();
    },
  };
}

/** The shell's answer, or nothing when it can't give one: the list still shows without it. */
async function foundOf(
  foldersFound: FoldersFound | undefined,
  locations: readonly string[],
): Promise<ReadonlyMap<string, boolean>> {
  if (foldersFound === undefined) {
    return new Map();
  }
  try {
    return await foldersFound(locations);
  } catch {
    return new Map();
  }
}
