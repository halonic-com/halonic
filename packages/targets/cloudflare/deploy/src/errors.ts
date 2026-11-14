/** Why a deploy step stopped. Callers branch on this, never on the message text. */
export type DeployErrorCode =
  | "cloudflare-request-failed"
  | "token-inactive"
  | "no-account"
  | "ambiguous-account"
  | "unmarked-resources"
  | "schema-newer-than-cli"
  | "invalid-migrations"
  | "deploy-locked"
  | "deploy-lock-lost"
  | "bundle-hash-mismatch"
  | "reserved-binding-name"
  | "traffic-split-in-progress"
  | "smoke-test-failed"
  | "uncommitted-changes"
  | "deploy-aborted";

/** A deploy failure with a stable code. The message never holds a token or a secret. */
export class DeployError extends Error {
  readonly code: DeployErrorCode;

  constructor(code: DeployErrorCode, message: string) {
    super(message);
    this.name = "DeployError";
    this.code = code;
  }
}

/** A deploy that found resources Halonic didn't make and wasn't allowed to adopt. */
export class UnmarkedResourcesError extends DeployError {
  readonly resources: readonly { readonly kind: string; readonly name: string }[];

  constructor(resources: readonly { readonly kind: string; readonly name: string }[]) {
    super(
      "unmarked-resources",
      `Found resources Halonic didn't create: ${resources.map((r) => `${r.kind} ${r.name}`).join(", ")}. Deploy again with adopt to use them.`,
    );
    this.name = "UnmarkedResourcesError";
    this.resources = resources;
  }
}

/** Another deploy holds the lock. Says who, and since when, so the user knows whether to wait. */
export class DeployLockedError extends DeployError {
  readonly holder: string;
  readonly startedAt: number;
  readonly expiresAt: number;

  constructor(holder: string, startedAt: number, expiresAt: number) {
    super(
      "deploy-locked",
      `${holder} is deploying (since ${new Date(startedAt).toISOString()}). Try again when it finishes. If it crashed, its lock frees itself by ${new Date(expiresAt).toISOString()}.`,
    );
    this.name = "DeployLockedError";
    this.holder = holder;
    this.startedAt = startedAt;
    this.expiresAt = expiresAt;
  }
}

/** The text a secret is replaced with. */
export const redactedMarker = "[redacted]";

/**
 * Replaces every occurrence of each secret in `text`. Cloudflare can echo a header or a body
 * back in an error, so every message built from a response goes through here.
 */
export function redact(text: string, secrets: readonly string[]): string {
  let safe = text;
  for (const secret of secrets) {
    if (secret.length === 0) continue;
    // Also the forms an echo can take: JSON-escaped (without its quotes) and URL-encoded.
    const forms = new Set([
      secret,
      JSON.stringify(secret).slice(1, -1),
      encodeURIComponent(secret),
    ]);
    for (const form of forms) safe = safe.split(form).join(redactedMarker);
  }
  return safe;
}

/** Why a new version went live before its self-test: nothing was deployed yet, or it carried Durable Object migrations. */
export type LiveReason = "first-deploy" | "migration";

const liveTails: Record<LiveReason, string> = {
  "first-deploy": "There was no previous version, so the new one is deployed but not working.",
  migration:
    "It carried a Durable Object migration, which Cloudflare only applies by deploying at once, so the new version is deployed but not working.",
};

function failureTail(liveReason: LiveReason | undefined): string {
  return liveReason
    ? liveTails[liveReason]
    : "Nothing was switched: the previous version is still live.";
}

/**
 * The new version failed its self-test. `liveBefore` says whether the old version still serves;
 * `liveReason` says why the new one was live already when it didn't.
 */
export class SmokeTestFailedError extends DeployError {
  readonly failedChecks: readonly string[];
  readonly liveBefore: boolean;
  readonly liveReason: LiveReason | undefined;

  readonly restoreFailed: boolean;

  constructor(failedChecks: readonly string[], liveReason?: LiveReason, restoreFailed = false) {
    const tail = restoreFailed
      ? "Putting the previous version back also failed: check the deployment in the Cloudflare dashboard."
      : failureTail(liveReason);
    super(
      "smoke-test-failed",
      `The new version failed its self-test (${failedChecks.join(", ") || "no answer"}). ${tail}`,
    );
    this.name = "SmokeTestFailedError";
    this.failedChecks = failedChecks;
    this.liveBefore = liveReason === undefined;
    this.liveReason = liveReason;
    this.restoreFailed = restoreFailed;
  }
}
