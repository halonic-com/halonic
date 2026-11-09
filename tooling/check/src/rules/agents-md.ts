import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import type { WorkspacePackage } from "../lib/workspace.ts";

/** What `pnpm new` writes until the owner states the purpose. */
export const purposePlaceholder = "TODO: one-line purpose";

const headerPattern = /^Owner: (\S+) · Layer: (\S+) · /m;

/**
 * Every package has its own short `AGENTS.md` with its owner, scope,
 * commands and local rules. Its `Owner:` and `Layer:` line must
 * say the same as `package.json`, and the purpose line must be filled in.
 */
export function checkAgentsMd(context: CheckContext): Report {
  const report = new Report("agents-md");
  const files = new Set(context.files);
  for (const pkg of context.packages) {
    if (pkg.directory === ".") {
      continue;
    }
    const file = `${pkg.directory}/AGENTS.md`;
    if (!files.has(file)) {
      report.error(
        pkg.manifestPath,
        `${pkg.directory} has no AGENTS.md. Add ${file} with its owner, scope, commands and local rules; "pnpm new" writes one from tooling/discover/templates/package-AGENTS.md.`,
      );
      continue;
    }
    const text = context.read(file);
    checkHeader(pkg, file, text, report);
    if (text.includes(purposePlaceholder)) {
      report.error(
        file,
        `Fill in the purpose line in ${file} (replace "${purposePlaceholder}" with one sentence).`,
      );
    }
  }
  return report;
}

/** The `Owner: … · Layer: …` line must be there and agree with `package.json`. */
function checkHeader(pkg: WorkspacePackage, file: string, text: string, report: Report): void {
  const header = headerPattern.exec(text);
  if (header === null) {
    report.error(
      file,
      `The "Owner: … · Layer: …" line is missing in ${file}. Restore it from tooling/discover/templates/package-AGENTS.md.`,
    );
    return;
  }
  const { owner, layer } = pkg.manifest.halonic ?? {};
  if (header[1] !== owner) {
    report.error(
      file,
      `Owner in ${file} is "${header[1]}" but package.json says "${owner ?? "(missing)"}". Make them the same.`,
    );
  }
  if (header[2] !== layer) {
    report.error(
      file,
      `Layer in ${file} is "${header[2]}" but package.json says "${layer ?? "(missing)"}". Make them the same.`,
    );
  }
}
