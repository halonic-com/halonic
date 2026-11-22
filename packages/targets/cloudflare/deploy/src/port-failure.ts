import type { DeployFailure, DeployFailureCode, DeployLockHolder } from "@halonicjs/ports";
import type { DeployLease } from "./api.ts";
import { DeployError, type DeployErrorCode, DeployLockedError } from "./errors.ts";

/** The kit's error kind, as the port names it. */
type RunFailureKind = DeployFailure["kind"];

/**
 * Each of this package's codes as the port's code and kind, so the command
 * line's exit code comes from the kind (requirement `ports.deploy-target`).
 * `smoke-test-failed` is a result on the port, never a failure: the target
 * turns it into one before this runs, so reaching here is a bug.
 */
const portCodes: Readonly<Record<DeployErrorCode, readonly [DeployFailureCode, RunFailureKind]>> = {
  "cloudflare-request-failed": ["host-request-failed", "unavailable"],
  "token-inactive": ["token-inactive", "unauthenticated"],
  "no-account": ["no-account", "not_found"],
  "ambiguous-account": ["ambiguous-account", "invalid_input"],
  "unmarked-resources": ["unmarked-resources", "conflict"],
  "schema-newer-than-cli": ["older-than-live", "conflict"],
  "invalid-migrations": ["unexpected", "internal"],
  "deploy-locked": ["deploy-locked", "conflict"],
  "deploy-lock-lost": ["deploy-locked", "conflict"],
  "bundle-hash-mismatch": ["unexpected", "internal"],
  "reserved-binding-name": ["unexpected", "internal"],
  "traffic-split-in-progress": ["traffic-split", "conflict"],
  "smoke-test-failed": ["unexpected", "internal"],
  "uncommitted-changes": ["uncommitted-changes", "conflict"],
  "deploy-aborted": ["stopped", "conflict"],
  "not-deployed": ["not-deployed", "not_found"],
  "nothing-to-roll-back": ["nothing-to-roll-back", "conflict"],
  "destroy-refused": ["unmarked-resources", "conflict"],
  "destroy-changed": ["destroy-changed", "conflict"],
  "bucket-not-empty": ["host-request-failed", "conflict"],
  "admin-key-left": ["transfer-failed", "internal"],
  "transfer-failed": ["transfer-failed", "unavailable"],
  "export-refused": ["transfer-failed", "denied"],
  "import-refused": ["transfer-failed", "conflict"],
};

/**
 * Turns whatever a Cloudflare call threw into the port's {@link DeployFailure}.
 * The message is this package's own, which never holds a token or a secret;
 * anything that isn't a {@link DeployError} keeps its message out, because it
 * may quote a host response.
 */
export function toDeployFailure(error: unknown): DeployFailure {
  if (!(error instanceof DeployError)) {
    return failure(
      "unexpected",
      "internal",
      "The Cloudflare deploy stopped on an unexpected error.",
      error,
    );
  }
  const [code, kind] = portCodes[error.code];
  return failure(code, kind, error.message, error);
}

/** The holder a second deploy is shown, from the stored lease or the error that names it. */
export function lockHolderOf(held: DeployLease | DeployLockedError): DeployLockHolder {
  const who = held instanceof DeployLockedError ? held.holder : held.label;
  return {
    who,
    startedAt: new Date(held.startedAt).toISOString(),
    expiresAt: new Date(held.expiresAt).toISOString(),
  };
}

/** A failure the target finds itself, with no error of its own behind it. `fix` says what to do next. */
export function portFailure(
  code: DeployFailureCode,
  kind: RunFailureKind,
  message: string,
  fix?: string,
): DeployFailure {
  return Object.assign(failure(code, kind, message, undefined), { fix });
}

function failure(
  code: DeployFailureCode,
  kind: RunFailureKind,
  message: string,
  cause: unknown,
): DeployFailure {
  return Object.assign(new Error(message, cause === undefined ? undefined : { cause }), {
    name: "DeployFailure",
    kind,
    code,
    fix: undefined,
  });
}
