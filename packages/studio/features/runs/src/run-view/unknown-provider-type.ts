// A provider file whose type Halonic can't call, read from a failed run's typed cause
// (requirement `runs.run-view.failure-banners`, HAL-12486). Only `cause` is read: it is the
// person's own typo in a file, so the banner says how to mend it instead of "Halonic can't tell
// the cause yet".

import type { RunSummary } from "@halonicjs/events";

/** The cause code the models adapter gives a provider type it has no adapter for. */
export const unknownProviderTypeCode = "models.unknown-provider-type";

/** What the cause names: the provider file's id and the type it gives. */
export interface UnknownProviderType {
  /** The provider's id, which is also its file's name: `weird` for `providers/weird.yaml`. */
  readonly provider: string;
  /** The type the file gives, such as `carrier-pigeon`. */
  readonly type: string;
}

/**
 * The provider and the type of a run that failed with a `models.unknown-provider-type` cause, or
 * `undefined` for any other run, or one whose cause is missing either name.
 *
 * @example
 * unknownProviderTypeOf(failedRun); // { provider: "weird", type: "carrier-pigeon" }
 */
export function unknownProviderTypeOf(summary: RunSummary): UnknownProviderType | undefined {
  const { cause } = summary;
  if (summary.status !== "failed" || cause?.code !== unknownProviderTypeCode) {
    return undefined;
  }
  const { provider, type } = cause.detail ?? {};
  if (provider === undefined || provider === "" || type === undefined || type === "") {
    return undefined;
  }
  return { provider, type };
}
