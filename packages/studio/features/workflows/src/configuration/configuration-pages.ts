/** The pages of Configuration, in the order of its list (G5 part 9). */
export const configurationPages = ["general", "request-form", "tests", "problems"] as const;

/** One page of Configuration. */
export type ConfigurationPage = (typeof configurationPages)[number];

/** The page Configuration opens on: Tests for a made test, Problems when asked for them, else General. */
export function configurationStart(
  madeTest: object | undefined,
  problemsAsked: number | undefined,
): ConfigurationPage | undefined {
  if (madeTest !== undefined) return "tests";
  return problemsAsked === undefined ? undefined : "problems";
}
