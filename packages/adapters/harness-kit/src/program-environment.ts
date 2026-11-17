// The variables a harness program gets from its starter's own (HAL-5397, N9),
// shared by the CLI and the agent host so both give a program the same list.

/** The names a harness program may inherit: where to find programs, and the locale. */
const inheritedNames = [
  "PATH",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "SystemRoot",
  "PATHEXT",
  "ComSpec",
];

/**
 * The variables a harness program gets from the starter's own: where to find programs, and the
 * locale, never a key. Built from a list of names, never by copying the environment and
 * removing entries, so a variable this list doesn't know never reaches the program, with or
 * without a fence (HAL-5397, N9).
 *
 * @example
 * const env = programEnvironment(process.env);
 */
export function programEnvironment(
  variables: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const given: Record<string, string> = {};
  for (const name of inheritedNames) {
    const value = variables[name];
    if (value !== undefined && value !== "") given[name] = value;
  }
  return given;
}
