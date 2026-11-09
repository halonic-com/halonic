import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import type { WorkspacePackage } from "../lib/workspace.ts";

/**
 * How an example file reaches the package's own code, which a package may not
 * import by name: each `exports` entry as the quoted `../src/...` path the
 * example imports, with the name the README shows instead. The `.` entry is
 * the package name; another entry is the name with its subpath, or the
 * published name when `halonic.publish.entry` is that entry. A missing
 * `entry` means `.`, as `tooling/publish` reads it.
 */
function ownImports(pkg: WorkspacePackage): Map<string, string> {
  const imports = new Map<string, string>();
  const name = pkg.manifest.name ?? pkg.directory;
  const exported = pkg.manifest.exports;
  const publish = pkg.manifest.halonic?.publish;
  const publishedEntry = publish?.entry ?? ".";
  const entries = typeof exported === "object" && exported !== null ? Object.entries(exported) : [];
  for (const [subpath, target] of entries) {
    if (typeof target !== "string" || !target.startsWith("./src/")) {
      continue;
    }
    const published = publishedEntry === subpath ? publish?.name : undefined;
    imports.set(JSON.stringify(`.${target}`), published ?? name + subpath.slice(1));
  }
  if (!imports.has('"../src/index.ts"')) {
    imports.set('"../src/index.ts"', name);
  }
  return imports;
}

const fenceStart = /^```(?:ts|typescript)\s*$/;

/** The text of the first TypeScript block that starts after `from`, with the line it starts on. */
function blockAfter(
  lines: readonly string[],
  from: number,
): { text: string; line: number } | undefined {
  for (let start = from; start < lines.length; start++) {
    if (!fenceStart.test(lines[start] ?? "")) {
      continue;
    }
    const end = lines.findIndex((line, index) => index > start && line.startsWith("```"));
    if (end === -1) {
      return undefined;
    }
    return { text: lines.slice(start + 1, end).join("\n"), line: start + 1 };
  }
  return undefined;
}

const withoutTrailingNewline = (text: string): string => text.replace(/(?:\r?\n)+$/, "");

/**
 * The README of a package with an `examples/` folder holds a copy of every
 * example file: the first TypeScript block after the line that links to
 * `examples/<file>`. The copy must equal the file, except that the file
 * imports the package's own `../src/` entries by path and the README imports
 * them by name (see `ownImports`), and a trailing newline doesn't count. The tested example can't go stale behind
 * the README.
 */
export function checkReadmeExamples(context: CheckContext): Report {
  const report = new Report("readme-examples");
  const files = new Set(context.files);
  for (const pkg of context.packages) {
    const prefix = `${pkg.directory}/examples/`;
    const examples = context.files.filter(
      (file) =>
        file.startsWith(prefix) && file.endsWith(".ts") && !file.slice(prefix.length).includes("/"),
    );
    const readme = `${pkg.directory}/README.md`;
    const name = pkg.manifest.name ?? pkg.directory;
    const imports = ownImports(pkg);
    for (const example of examples) {
      const relative = example.slice(pkg.directory.length + 1);
      const fix = `Add a \`\`\`ts block with the contents of ${example} to ${readme}, right after a line that links to [\`${relative}\`](${relative}).`;
      if (!files.has(readme)) {
        report.error(example, `${name} has ${relative} but no README.md. ${fix}`);
        continue;
      }
      const lines = context.read(readme).split(/\r?\n/);
      const link = lines.findIndex((line) => line.includes(`](${relative})`));
      if (link === -1) {
        report.error(readme, `${name}: ${relative} has no block in ${readme}. ${fix}`);
        continue;
      }
      const block = blockAfter(lines, link);
      if (block === undefined) {
        report.error(
          readme,
          `${name}: ${readme} links to ${relative} but has no \`\`\`ts block after the link. ${fix}`,
          link + 1,
        );
        continue;
      }
      let expected = withoutTrailingNewline(context.read(example));
      for (const [path, specifier] of imports) {
        expected = expected.replaceAll(path, JSON.stringify(specifier));
      }
      if (withoutTrailingNewline(block.text) !== expected) {
        report.error(
          readme,
          `${name}: the block in ${readme} differs from ${example}. Copy the file into the block again; only the imports of the package's own \`../src/\` files may differ, and they read as the package name in the README, e.g. "${name}".`,
          block.line,
        );
      }
    }
  }
  return report;
}
