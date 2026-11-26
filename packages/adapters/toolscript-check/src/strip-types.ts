import ts from "@typescript/typescript6";

/**
 * How a ToolScript is compiled (HAL-17560, 1.4): ES2023, an ES module, types
 * stripped, nothing bundled, no source map, `\n` line ends. Fixed here, so the
 * same source gives the same code on every machine.
 */
export const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2023,
  module: ts.ModuleKind.ES2022,
  newLine: ts.NewLineKind.LineFeed,
  isolatedModules: true,
  sourceMap: false,
  inlineSourceMap: false,
  removeComments: false,
};

/** The source without a byte-order mark and with `\n` line ends, so a Windows checkout builds the same. */
export function normalizeSource(source: string): string {
  const withoutMark = source.startsWith("\uFEFF") ? source.slice(1) : source;
  return withoutMark.replaceAll("\r\n", "\n");
}

/**
 * Strips the types from a ToolScript with TypeScript's `transpileModule` and
 * returns the JavaScript. It doesn't check anything: run `checkToolScript`
 * first. Studio uses it on its own to build workspace scripts from the source
 * it showed for review (HAL-17560, 1.4).
 *
 * @example
 * const code = stripTypes(source, "sync.tool.ts");
 */
export function stripTypes(source: string, fileName: string): string {
  return ts.transpileModule(normalizeSource(source), { fileName, compilerOptions }).outputText;
}
