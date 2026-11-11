import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadContext } from "../lib/context.ts";
import { compactTables } from "../lib/markdown-tables.ts";
import { findRepoRoot } from "../lib/workspace.ts";

/**
 * pnpm check:tables
 *
 * Rewrites every padded Markdown table in the repo as `| a | b |`, the form
 * the `markdown-tables` check wants. It changes only table rows.
 */
function main(): number {
  const context = loadContext(findRepoRoot());
  let changed = 0;
  for (const file of context.files.filter((name) => name.endsWith(".md"))) {
    const text = context.read(file);
    const compact = compactTables(text);
    if (compact !== text) {
      writeFileSync(join(context.root, file), compact);
      changed++;
    }
  }
  console.log(`check:tables: rewrote the tables in ${changed} file(s).`);
  return 0;
}

process.exitCode = main();
