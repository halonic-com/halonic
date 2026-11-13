import type { SignInTokens } from "@halonicjs/ports";
import {
  type SecretForms,
  type SecretOnWire,
  SecretRemover,
  secretForms,
} from "./secret-filter.ts";

/**
 * The forms the filter looks for now. Sign-in tokens change while an
 * integration runs, so a filter outside the kit, such as the runner bridge's,
 * asks for them each time it filters instead of keeping the forms it built
 * at the start. The same `SecretForms` object comes back until a value changes.
 */
export type CurrentSecretForms = () => SecretForms;

/**
 * The forms of `secrets` and of every value the sign-ins' `filterValues`
 * lists now: the access tokens not yet expired, the refresh token and the
 * client secret. A sign-in value is matched in every form a secret is.
 *
 * @example
 * const current = currentSecretForms([{ value: key }], signIns.tokens);
 * removeSecrets(text, current());
 */
export function currentSecretForms(
  secrets: readonly SecretOnWire[],
  signIns?: Pick<SignInTokens, "filterValues">,
): CurrentSecretForms {
  const fixed = secretForms(secrets);
  if (signIns === undefined) {
    return () => fixed;
  }
  let listed: readonly string[] = [];
  let forms = fixed;
  return () => {
    const values = signIns.filterValues();
    if (!sameValues(values, listed)) {
      listed = [...values];
      forms = secretForms([...secrets, ...values.map((value) => ({ value }))]);
    }
    return forms;
  };
}

function sameValues(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * A stream step that removes the current secrets, for the bridge's stderr.
 * When the forms change, a value that began in the bytes held back and ends in
 * the next piece is still found: the held bytes go through the new forms again.
 *
 * @example
 * runner.stderr.pipeThrough(removeCurrentSecretsStream(current))
 */
export function removeCurrentSecretsStream(
  current: CurrentSecretForms,
): TransformStream<Uint8Array, Uint8Array> {
  let forms = current();
  let remover = new SecretRemover(forms);
  return new TransformStream({
    transform(piece, controller) {
      const now = current();
      if (now !== forms) {
        const held = remover.flush();
        forms = now;
        remover = new SecretRemover(now);
        enqueueIfAny(controller, remover.push(held));
      }
      enqueueIfAny(controller, remover.push(piece));
    },
    flush(controller) {
      enqueueIfAny(controller, remover.flush());
    },
  });
}

function enqueueIfAny(
  controller: TransformStreamDefaultController<Uint8Array>,
  bytes: Uint8Array,
): void {
  if (bytes.length > 0) controller.enqueue(bytes);
}
