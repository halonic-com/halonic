/** Why a deploy step stopped. Callers branch on this, never on the message text. */
export type DeployErrorCode =
  | "cloudflare-request-failed"
  | "token-inactive"
  | "no-account"
  | "ambiguous-account"
  | "unmarked-resources"
  | "schema-newer-than-cli"
  | "invalid-migrations";

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

/** The text a secret is replaced with. */
export const redactedMarker = "[redacted]";

/**
 * Replaces every occurrence of each secret in `text`. Cloudflare can echo a header or a body
 * back in an error, so every message built from a response goes through here.
 */
export function redact(text: string, secrets: readonly string[]): string {
  let safe = text;
  for (const secret of secrets) {
    if (secret.length > 0) safe = safe.split(secret).join(redactedMarker);
  }
  return safe;
}
