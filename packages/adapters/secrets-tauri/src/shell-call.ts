import { KeychainError, keychainFailure } from "./keychain-error.ts";
import type { TauriShell } from "./shell.ts";

/**
 * Runs one keychain command, turning a refusal into a `RangeError` or a
 * {@link KeychainError}. Shared by the secrets and the tokens, which call the
 * same shell with different commands.
 *
 * @param value - the value being set, so a refusal that repeats it loses its message
 */
export async function callShell(
  shell: TauriShell,
  command: string,
  args: Record<string, unknown>,
  value?: string,
): Promise<unknown> {
  try {
    return await shell.invoke(command, args);
  } catch (reason) {
    throw keychainFailure(reason, value);
  }
}

/**
 * A read command's answer: non-empty text, or `null` when nothing is stored.
 * The shell never stores an empty value, so `""` is as malformed as a number.
 */
export function expectValue(answer: unknown): string | null {
  if (answer === null || (typeof answer === "string" && answer !== "")) {
    return answer;
  }
  throw new KeychainError("backend", "the shell's answer is not a value");
}

/**
 * A set or delete command returns Rust's `()`, which reaches the page as
 * `null`. Any other answer means the call may not have done what it says, so
 * it is refused rather than taken for success.
 */
export function expectNothing(answer: unknown): void {
  if (answer !== null) {
    throw new KeychainError("backend", "the shell's answer is not empty");
  }
}
