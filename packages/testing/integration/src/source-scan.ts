/** Something in an integration's source that reaches past its host. */
export interface SourceFinding {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
}

/** What else the scan may allow. */
export interface SourceScanOptions {
  /**
   * Packages the build bundles into the integration, imported by name, whose
   * own files the scanned sources also hold, such as a shared helper package
   * in the integrations repo.
   */
  readonly bundled?: readonly string[];
}

/** One static import or `export … from` in a source file. */
export interface SourceImport {
  readonly specifier: string;
  readonly line: number;
  /** `import type` or `export type`: the compiler removes it, so it loads nothing. */
  readonly typeOnly: boolean;
}

/**
 * The packages integration code may import by name: `zod`, which the fenced
 * runner allows, and the kit, which the build bundles. The runner refuses
 * every other import that isn't the integration's own file.
 */
const allowedPackages: readonly string[] = ["zod", "@halonicjs/adapters/integration-kit"];

/** The rule an import outside the allow-list breaks. */
const importRule = "imports other than its own files, zod or the kit";

/**
 * What integration code may not use: everything that reaches the network,
 * the file system, the environment, new code or a timer without the host. The
 * isolated worker of step I5 refuses the same at run time; this catches it
 * before review.
 */
const rules: readonly { rule: string; pattern: RegExp }[] = [
  { rule: "global fetch (use host.http)", pattern: /(?<![.\w$])fetch\s*\(/ },
  { rule: "globalThis, window or self", pattern: /\b(?:globalThis|window|self)\b/ },
  { rule: "process or the environment", pattern: /\bprocess\b|\bDeno\b|\bBun\b/ },
  { rule: "node: modules", pattern: /["']node:|\brequire\s*\(/ },
  { rule: "dynamic import", pattern: /\bimport\s*\(/ },
  {
    rule: "eval or new Function",
    // Any mention of `eval` counts, so `(0, eval)(code)` and `const run = eval` do too.
    // A function's `constructor` is `Function`, so reaching it by name counts as well.
    pattern: /\beval\b|\bnew\s+Function\b|\bFunction\s*\(|\.\s*constructor\b|["'`]constructor["'`]/,
  },
  {
    rule: "timers (use host.wait)",
    pattern: /\b(?:setTimeout|setInterval|setImmediate)\s*\(|\bAbortSignal\s*\.\s*timeout\b/,
  },
  { rule: "other network APIs", pattern: /\b(?:XMLHttpRequest|WebSocket|EventSource|navigator)\b/ },
];

/**
 * Scans integration source files, by path, for what integration code may
 * not use. Comments are scanned too: a comment that names `process` is
 * cheap to reword and keeps the rule simple. Every import must name one of
 * its own files (a relative path that stays inside the folder the paths are
 * relative to), `zod`, the kit or a package in `options.bundled`; a
 * type-only import loads nothing and may name anything.
 *
 * @example
 * scanIntegrationSource({ "src/index.ts": 'const key = process.env.KEY;' });
 * // [{ file: "src/index.ts", line: 1, rule: "process or the environment" }]
 */
export function scanIntegrationSource(
  files: Readonly<Record<string, string>>,
  options: SourceScanOptions = {},
): SourceFinding[] {
  const findings: SourceFinding[] = [];
  const packages = [...allowedPackages, ...(options.bundled ?? [])];
  for (const [file, text] of Object.entries(files)) {
    text.split("\n").forEach((content, index) => {
      for (const { rule, pattern } of rules) {
        if (pattern.test(content)) findings.push({ file, line: index + 1, rule });
      }
    });
    for (const found of sourceImports(text)) {
      if (!found.typeOnly && !importAllowed(file, found.specifier, packages))
        findings.push({ file, line: found.line, rule: importRule });
    }
  }
  return findings;
}

/**
 * Every static import and `export … from` in a source file, in order. Any
 * `from` followed by a quoted name counts, in a comment too, so an odd way
 * of writing an import can't hide one, with comments before the name too;
 * only a plain `import type` is type-only. `import type from` is a
 * default import named `type`, so it isn't.
 *
 * @example
 * sourceImports(text); // [{ specifier: "zod", line: 1, typeOnly: false }] for a file that imports zod first
 */
export function sourceImports(text: string): SourceImport[] {
  const typeOnlyAt = new Set<number>();
  for (const match of text.matchAll(typeOnlyImport)) {
    typeOnlyAt.add(match.index + match[0].length);
  }
  const imports: SourceImport[] = [];
  for (const match of text.matchAll(anyImport)) {
    const specifier = match[2] ?? "";
    const at = match.index + match[0].length - specifier.length - 1;
    imports.push({
      specifier,
      line: text.slice(0, at).split("\n").length,
      typeOnly: typeOnlyAt.has(at),
    });
  }
  return imports;
}

/** Whitespace and comments, which JavaScript allows between `from` and the name. */
const gap = String.raw`(?:\s|/\*[\s\S]*?\*/|//[^\n]*\n)*`;

/**
 * A plain `import type` or `export type` clause up to its quote. After `type`
 * comes exactly one name, `*`, `* as name` or one `{ … }` list, never `from`
 * or `,`, which would make `type` itself the default import's name. The exact
 * shape keeps the match from running past a `}` into the next statement.
 */
const typeOnlyClause = String.raw`(?:[\w$]+|\*(?:\s+as\s+[\w$]+)?|\{[\w$,\s]*\})`;
const typeOnlyImport = new RegExp(
  String.raw`\b(?:import|export)\s+type\s+(?!from\b)${typeOnlyClause}\s*from${gap}["']`,
  "g",
);

/** Every `from` or `import` followed by a quoted name: the name is group 2. */
const anyImport = new RegExp(String.raw`\b(?:from|import)${gap}(["'])([^"'\n]*)\1`, "g");

/** Whether `file` may import `specifier`: its own file inside the folder, or an allowed package. */
function importAllowed(file: string, specifier: string, packages: readonly string[]): boolean {
  if (specifier.startsWith("./") || specifier.startsWith("../"))
    return staysInFolder(file, specifier);
  return packages.some((name) => specifier === name || specifier.startsWith(`${name}/`));
}

/** Whether a relative import from `file` stays inside the folder the paths are relative to. */
function staysInFolder(file: string, specifier: string): boolean {
  const parts = file.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "..") {
      if (parts.length === 0) return false;
      parts.pop();
    } else if (part !== "." && part !== "") {
      parts.push(part);
    }
  }
  return true;
}
