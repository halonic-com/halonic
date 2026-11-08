/** Something in an integration's source that reaches past its host. */
export interface SourceFinding {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
}

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
  { rule: "eval or new Function", pattern: /\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(/ },
  {
    rule: "timers (use host.wait)",
    pattern: /\b(?:setTimeout|setInterval|setImmediate)\s*\(|\bAbortSignal\s*\.\s*timeout\b/,
  },
  { rule: "other network APIs", pattern: /\b(?:XMLHttpRequest|WebSocket|EventSource|navigator)\b/ },
];

/**
 * Scans integration source files, by path, for what integration code may
 * not use. Comments are scanned too: a comment that names `process` is
 * cheap to reword and keeps the rule simple.
 *
 * @example
 * scanIntegrationSource({ "src/index.ts": 'const key = process.env.KEY;' });
 * // [{ file: "src/index.ts", line: 1, rule: "process or the environment" }]
 */
export function scanIntegrationSource(files: Readonly<Record<string, string>>): SourceFinding[] {
  const findings: SourceFinding[] = [];
  for (const [file, text] of Object.entries(files)) {
    text.split("\n").forEach((content, index) => {
      for (const { rule, pattern } of rules) {
        if (pattern.test(content)) findings.push({ file, line: index + 1, rule });
      }
    });
  }
  return findings;
}
