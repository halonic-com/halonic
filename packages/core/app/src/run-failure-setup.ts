// The failures a run stops on because of the setup of the workspace or of
// this computer, read from the cause the engine names (HAL-12377).
import type { RunFailureCause } from "@halonicjs/events";
import { configFailureOf } from "./run-failure-config.ts";
import type { RunFailure } from "./run-failure-facts.ts";
import { keyAddressFailureOf } from "./run-failure-key-address.ts";

/**
 * The failure an `error` names by its cause's code, when it has facts of
 * its own. These are the setup of the workspace or of this computer, not a
 * bug: a provider file whose type Halonic can't call (HAL-12342), a model
 * alias the hub doesn't have, such as `default` in a workspace made with
 * plain `halonic init` (HAL-12377), a secrets file other users can read
 * (HAL-12569), a provider a model names that the workspace doesn't have, a
 * key or provider the model check refused (HAL-15333), and a workflow
 * step the run can't go on from: for-each items that aren't a list, an event with no transition, a task with no agent (HAL-14301). A
 * cause without the names its facts need is `error`. Studio reads its run
 * summary's cause with it, so both word the same facts (HAL-14324).
 *
 * @returns `undefined` for a cause that isn't one of these, or misses a name
 */
export function setupFailureOf(cause: RunFailureCause | undefined): RunFailure | undefined {
  const { code, detail = {} } = cause ?? {};
  switch (code) {
    case "models.unknown-provider-type": {
      const { provider, type } = detail;
      return provider === undefined || type === undefined
        ? undefined
        : { reason: "unknown-provider-type", provider, type };
    }
    case "models.unknown-model-alias": {
      const { alias, hub } = detail;
      return alias === undefined || hub === undefined
        ? undefined
        : { reason: "unknown-model-alias", alias, hub };
    }
    case "secrets.file-readable": {
      const { file } = detail;
      return file === undefined ? undefined : { reason: "secrets-file-readable", file };
    }
    default:
      return keyAddressFailureOf(code, detail) ?? configFailureOf(code, detail);
  }
}

/**
 * Whether a failed run's cause is one of the setup problems with facts of
 * its own, so a client can treat the run by the cause's own kind, the kind
 * `--json` shows in the run's `cause`, rather than as a broken run
 * (HAL-12377): `not_found` for a missing model alias, `denied` for a secrets
 * file other users can read (HAL-12569).
 */
export function isSetupCause(cause: RunFailureCause | undefined): cause is RunFailureCause {
  return setupFailureOf(cause) !== undefined;
}
