import type { TrustRecord, TrustStore } from "@halonicjs/ports";

/**
 * The profile's trust records, read only. A trust check shrinks a record when
 * the workspace removed something it trusted, and saves it; the doctor only
 * looks, so it gets the check's answer and the record stays as it was. The
 * record is shrunk by the next `run` or `trust`, which do save.
 */
export function readOnlyTrustStore(store: TrustStore): TrustStore {
  return {
    get: (location: string) => store.get(location),
    list: () => store.list(),
    grant: async (_record: TrustRecord) => {},
    revoke: async (_location: string) => {},
  };
}
