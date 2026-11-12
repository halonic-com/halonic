import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DependencyList } from "../lib/config-files.ts";
import { type LicencePolicy, licenceTextPath } from "../lib/licences.ts";
import {
  findSbomProblems,
  type NoticeEntry,
  renderNotices,
  type Sbom,
  type VendoredNotice,
  withProduct,
} from "../lib/sbom.ts";
import { findRepoRoot, listWorkspacePackages, readJson } from "../lib/workspace.ts";

/**
 * pnpm check:sbom --name <product> --version <v> --out <dir> [--package <name>] [--notices]
 *
 * Release step. Writes `<product>-<v>.cdx.json` (CycloneDX, made by
 * `pnpm sbom`, so no extra tool) for the production dependencies of one
 * package, or of the whole workspace when `--package` is left out. The SBOM
 * names `<product>` at `<v>` as the product it describes. Fails when
 * a library in it is not on `tooling/check/dependencies.json`. With
 * `--notices` it also writes `THIRD-PARTY-NOTICES.txt` for the same set,
 * plus the vendored files in `tooling/check/licences.json`.
 * Needs `pnpm install` first: licence texts are read from the install.
 */

interface LicenceListEntry {
  readonly name: string;
  readonly versions: readonly string[];
  readonly paths?: readonly string[];
  readonly author?: string;
  readonly homepage?: string;
}

const licenceFile = /^(licen[cs]e|copying|notice)(\.|$)/i;

function option(argv: readonly string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
}

// On Windows `pnpm` is `pnpm.cmd`, which `execFileSync` can't start without a
// shell. Under `pnpm check:sbom`, pnpm names its own entry point in
// `npm_execpath`, so run that instead.
function pnpmCommand(): [string, string[]] {
  const execPath = process.env["npm_execpath"];
  if (execPath === undefined || !/pnpm/i.test(execPath)) {
    return ["pnpm", []];
  }
  return /\.[cm]?js$/i.test(execPath) ? [process.execPath, [execPath]] : [execPath, []];
}

function pnpm(root: string, args: readonly string[]): string {
  const [file, prefix] = pnpmCommand();
  return execFileSync(file, [...prefix, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

function licenceText(paths: readonly string[] | undefined): string | undefined {
  for (const directory of paths ?? []) {
    if (!existsSync(directory)) {
      continue;
    }
    const files = readdirSync(directory)
      .filter((file) => licenceFile.test(file))
      .sort();
    if (files.length > 0) {
      return files.map((file) => readFileSync(join(directory, file), "utf8")).join("\n\n");
    }
  }
  return undefined;
}

function noticeEntries(root: string, scope: readonly string[]): NoticeEntry[] {
  const output = pnpm(root, [...scope, "licenses", "list", "--json", "--long", "--prod"]);
  const byLicence = JSON.parse(output.trim() === "" ? "{}" : output) as Record<
    string,
    LicenceListEntry[]
  >;
  return Object.entries(byLicence).flatMap(([licence, entries]) =>
    entries.map((entry) => {
      const text = licenceText(entry.paths);
      return {
        name: entry.name,
        versions: entry.versions,
        licence,
        ...(entry.author === undefined ? {} : { author: entry.author }),
        ...(entry.homepage === undefined ? {} : { homepage: entry.homepage }),
        ...(text === undefined ? {} : { text }),
      };
    }),
  );
}

/** The vendored files of `licences.json`, each with its licence text. */
function vendoredNotices(root: string): VendoredNotice[] {
  const policy = readJson<LicencePolicy>(join(root, "tooling/check/licences.json"));
  return (policy.vendored ?? []).map((entry) => ({
    name: entry.name,
    path: entry.path,
    licence: entry.licence,
    source: entry.source,
    text: readFileSync(join(root, licenceTextPath(entry.licence)), "utf8"),
  }));
}

function main(argv: readonly string[]): number {
  const version = option(argv, "--version");
  const out = option(argv, "--out");
  const name = option(argv, "--name");
  const product = option(argv, "--package");
  if (name === undefined || version === undefined || out === undefined) {
    console.error(
      "Usage: pnpm check:sbom --name <product> --version <v> --out <dir> [--package <name>] [--notices]",
    );
    return 2;
  }
  const root = findRepoRoot();
  const scope = product === undefined ? ["--recursive"] : ["--filter", product];
  mkdirSync(out, { recursive: true });
  const sbomPath = join(out, `${name}-${version}.cdx.json`);
  pnpm(root, ["sbom", ...scope, "--sbom-format", "cyclonedx", "--prod", "--out", sbomPath]);
  const sbom = withProduct(readJson<Sbom>(sbomPath), name, version);
  writeFileSync(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`);
  const problems = findSbomProblems(
    sbom,
    readJson<DependencyList>(join(root, "tooling/check/dependencies.json")),
    new Set(listWorkspacePackages(root).flatMap((pkg) => pkg.manifest.name ?? [])),
  );
  const annotate = process.env["GITHUB_ACTIONS"] === "true";
  for (const problem of problems) {
    console.log(annotate ? `::error title=sbom::${problem}` : `error [sbom] ${problem}`);
  }
  console.log(
    `check:sbom: ${problems.length} problem(s) in ${sbom.components?.length ?? 0} component(s), written to ${sbomPath}.`,
  );
  if (argv.includes("--notices")) {
    const entries = noticeEntries(root, scope);
    const vendored = vendoredNotices(root);
    writeFileSync(
      join(out, "THIRD-PARTY-NOTICES.txt"),
      renderNotices("Halonic", entries, vendored),
    );
    console.log(
      `check:sbom: notices for ${entries.length} package(s) and ${vendored.length} vendored file(s).`,
    );
  }
  return problems.length === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
