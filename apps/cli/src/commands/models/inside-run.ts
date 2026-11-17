/**
 * The variable the engine puts into the environment of a harness run
 * (`harness-claude-code` and `harness-codex`, `environment.ts`). Only its
 * presence is read here, never its value.
 */
const runMarker = "HALONIC_RUN_TOKEN";

/**
 * Whether the command was started from inside a run, so by a tool of an agent
 * and not by a person.
 *
 * This is a second layer, not the security boundary. A tool can remove the
 * marker before it starts the command; what stops it is the sandbox, which
 * denies a run the profile folder where the key's addresses are kept. The
 * check is here so an honest agent gets a clear answer and not a file error.
 * Do not add a switch to turn it off (HAL-11873, decided by Liam).
 */
export function insideRun(env: Readonly<Record<string, string | undefined>>): boolean {
  return Object.hasOwn(env, runMarker);
}
