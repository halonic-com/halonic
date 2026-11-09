const specifierPattern = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"'\n]+)\2/g;

/** Calls `replace` for every import specifier in `code` and swaps in what it returns (or keeps the original on `undefined`). */
export function rewriteSpecifiers(
  code: string,
  replace: (specifier: string) => string | undefined,
): string {
  return code.replace(specifierPattern, (whole, lead: string, quote: string, specifier: string) => {
    const replacement = replace(specifier);
    return replacement === undefined ? whole : `${lead}${quote}${replacement}${quote}`;
  });
}

/** The package name of a bare specifier: `@scope/name/sub` gives `@scope/name`, `zod/v4` gives `zod`. Undefined for relative paths and `node:` modules. */
export function packageOf(specifier: string): string | undefined {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) {
    return undefined;
  }
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}
