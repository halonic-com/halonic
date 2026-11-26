import type { SecretRef } from "./stack-rebase-job.ts";

/**
 * The PR write tools' setting (HAL-18983), split from `manifest.ts` to keep
 * it under the size limit and free of the tools' imports.
 */

/** The PR write credential's field. */
export const prWriteConfigProperties = {
  // Read only here, at each write, inside the PR write client. Declared a string: the host
  // checks the field with the secret binding swapped for its id.
  prWriteToken: {
    type: "string",
    title: "PR write token",
    description:
      "The secret with the PR write credential (a GitHub App the board creates, Pull requests write on halonic-com/halonic only, nothing else). Used only by write_pr and the readyPr step of set_next_step and finish_run.",
    format: "secret-ref",
  },
} as const;

/** The secret reference in the settings, or undefined when none is set. */
export function readPrWriteToken(config: Readonly<Record<string, unknown>>): SecretRef | undefined {
  const token = config["prWriteToken"] as { type?: unknown; secretId?: unknown } | undefined;
  return token?.type === "secret_ref" && typeof token.secretId === "string"
    ? { type: "secret_ref", secretId: token.secretId }
    : undefined;
}
