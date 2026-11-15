/** The pages of Configuration, in the order of its list (G5 part 9). */
export const configurationPages = ["general", "request-form", "tests", "problems"] as const;

/** One page of Configuration. */
export type ConfigurationPage = (typeof configurationPages)[number];

/** The page after (`1`) or before (`-1`) `page`, wrapping round; Home and End go to the ends. */
export function pageForKey(
  page: ConfigurationPage,
  key: string,
  pages: readonly ConfigurationPage[] = configurationPages,
): ConfigurationPage | undefined {
  const at = pages.indexOf(page);
  const last = pages.length - 1;
  switch (key) {
    case "ArrowDown":
      return pages[at === last ? 0 : at + 1];
    case "ArrowUp":
      return pages[at === 0 ? last : at - 1];
    case "Home":
      return pages[0];
    case "End":
      return pages[last];
    default:
      return undefined;
  }
}
