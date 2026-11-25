import type { RunOwnership, RunOwnershipStore } from "./many-users-api.ts";

/** A {@link RunOwnershipStore} in memory, for one scope; seed it with runs that already have owners. */
export function memoryRunOwnership(seed: Record<string, RunOwnership> = {}): RunOwnershipStore {
  const owners = new Map(Object.entries(seed));
  return {
    async claim(runId, owner) {
      const stored = owners.get(runId);
      if (stored !== undefined) return stored;
      owners.set(runId, owner);
      return owner;
    },
    async get(runId) {
      return owners.get(runId) ?? null;
    },
  };
}
