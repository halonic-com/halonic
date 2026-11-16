import type { ChangesSource, Identity } from "./api.ts";
import { identityWords } from "./changes-words.ts";
import { isAuthorEmail, isAuthorName } from "./identity.ts";
import { loadFailureReason } from "./load-failure.ts";

/** What {@link saveIdentity} did; `invalid` says what is wrong under each field. */
export type IdentityOutcome =
  | { readonly kind: "saved"; readonly identity: Identity }
  | {
      readonly kind: "invalid";
      readonly name: string | undefined;
      readonly email: string | undefined;
    }
  | { readonly kind: "failed"; readonly reason: string };

/**
 * Saves who versions are from. Says what is wrong with a name or email that is empty or isn't
 * one, without reaching git, or why git refused.
 */
export async function saveIdentity(
  source: ChangesSource,
  identity: Identity,
): Promise<IdentityOutcome> {
  const name = identity.name.trim();
  const email = identity.email.trim();
  const nameProblem = isAuthorName(name) ? undefined : identityWords.emptyName;
  const emailProblem = isAuthorEmail(email) ? undefined : identityWords.badEmail;
  if (nameProblem !== undefined || emailProblem !== undefined) {
    return { kind: "invalid", name: nameProblem, email: emailProblem };
  }
  try {
    await source.setIdentity({ name, email });
  } catch (error) {
    return { kind: "failed", reason: loadFailureReason(error) };
  }
  return { kind: "saved", identity: { name, email } };
}
