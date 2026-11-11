// No npm imports here: the guard-notes job runs without an install (HAL-5613).

/** File endings the parser reads. */
export const sourceExtensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

/** True when the file is TypeScript or JavaScript source. */
export function isSourceFile(file: string): boolean {
  return sourceExtensions.some((extension) => file.endsWith(extension));
}

/**
 * Test files may use dev tooling such as Vitest. They end in `.test.ts` or
 * `.spec.ts`; a `test/` folder alone doesn't make a file a test.
 */
export function isTestFile(file: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
}
