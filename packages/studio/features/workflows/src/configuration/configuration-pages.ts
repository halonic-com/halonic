/** The pages of Configuration, in the order of its list (G5 part 9). */
export const configurationPages = ["general", "request-form", "tests", "problems"] as const;

/** One page of Configuration. */
export type ConfigurationPage = (typeof configurationPages)[number];
