// A provider file whose type Halonic can't call, read from a failed run's
// typed cause (`models.unknown-provider-type`, HAL-12342). It is the
// person's own typo in a file, not a bug, so the CLI's failure lines and
// Studio's run page both name the file to mend, from this one reading.

import type { RunFailureCause } from "@halonicjs/events";

/** What the cause names: the provider file's id and the type it gives. */
export interface UnknownProviderType {
  /** The provider's id, which is also its file's name: `weird` for `providers/weird.yaml`. */
  readonly provider: string;
  /** The type the file gives, which Halonic has no adapter for, such as `carrier-pigeon`. */
  readonly type: string;
}

/**
 * The provider and the type a `models.unknown-provider-type` cause names, or
 * `undefined` for any other cause, or one that is missing either name.
 *
 * @example
 * unknownProviderTypeOf(failed.cause); // { provider: "weird", type: "carrier-pigeon" }
 */
export function unknownProviderTypeOf(
  cause: RunFailureCause | undefined,
): UnknownProviderType | undefined {
  if (cause?.code !== "models.unknown-provider-type") {
    return undefined;
  }
  const { provider, type } = cause.detail ?? {};
  return provider === undefined || type === undefined ? undefined : { provider, type };
}
