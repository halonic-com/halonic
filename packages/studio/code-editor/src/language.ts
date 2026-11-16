export type EditorLanguage = "yaml" | "markdown" | "plain";

/** The language a file is shown in, chosen from its name. */
export function languageFor(path: string): EditorLanguage {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (name.endsWith(".yaml") || name.endsWith(".yml")) return "yaml";
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";
  return "plain";
}
