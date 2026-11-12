import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type CargoMetadata,
  type CargoPackage,
  type LicencePolicy as CrateLicencePolicy,
  cargoNoticeEntries,
  linkedCrates,
} from "../lib/cargo-notices.ts";
import type { DependencyList } from "../lib/config-files.ts";
import { readDeny } from "../lib/deny.ts";
import { type LicencePolicy, licenceTextPath } from "../lib/licences.ts";
import {
  findSbomProblems,
  type NoticeEntry,
  type NoticeSection,
  renderNotices,
  type Sbom,
  withProduct,
} from "../lib/sbom.ts";
import { findRepoRoot, listWorkspacePackages, readJson } from "../lib/workspace.ts";

/**
 * pnpm check:sbom --name <product> --version <v> --out <dir> [--package <name>]
 *   [--notices [--cargo <dir> --cargo-target <triple>]...]
 *
 * Release step. Writes `<product>-<v>.cdx.json` (CycloneDX, made by
 * `pnpm sbom`, so no extra tool) for the production dependencies of one
 * package, or of the whole workspace when `--package` is left out. The SBOM
 * names `<product>` at `<v>` as the product it describes. Fails when
 * a library in it is not on `tooling/check/dependencies.json`. With
 * `--notices` it also writes `THIRD-PARTY-NOTICES.txt` for the same set,
 * plus the vendored files in `tooling/check/licences.json`.
 * Needs `pnpm install` first: licence texts are read from the install.
 *
 * With `--cargo` the notices also list the Rust crates the Cargo workspace in
 * `<dir>` links for each `--cargo-target` (HAL-6289), read with `cargo
 * metadata`, which fetches them on a clean machine. It fails when a crate's
 * licence is not allowed by `<dir>/deny.toml` or a crate has no licence text.
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

function options(argv: readonly string[], flag: string): string[] {
  return argv.flatMap((value, at) => (argv[at - 1] === flag ? [value] : []));
}

function pnpm(root: string, args: readonly string[]): string {
  const [file, prefix] = pnpmCommand();
  return execFileSync(file, [...prefix, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

function licenceTexts(paths: readonly string[] | undefined): string[] {
  for (const directory of paths ?? []) {
    if (!existsSync(directory)) {
      continue;
    }
    const files = readdirSync(directory)
      .filter((file) => licenceFile.test(file))
      .sort();
    if (files.length > 0) {
      return files.map((file) => readFileSync(join(directory, file), "utf8"));
    }
  }
  return [];
}

function noticeEntries(root: string, scope: readonly string[]): NoticeEntry[] {
  const output = pnpm(root, [...scope, "licenses", "list", "--json", "--long", "--prod"]);
  const byLicence = JSON.parse(output.trim() === "" ? "{}" : output) as Record<
    string,
    LicenceListEntry[]
  >;
  return Object.entries(byLicence).flatMap(([licence, entries]) =>
    entries.map((entry) => {
      const texts = licenceTexts(entry.paths);
      return {
        name: entry.name,
        versions: entry.versions,
        licence,
        ...(entry.author === undefined ? {} : { author: entry.author }),
        ...(entry.homepage === undefined ? {} : { homepage: entry.homepage }),
        texts,
      };
    }),
  );
}

/** The vendored files of `licences.json`, each with its licence text. */
function vendoredNotices(root: string): NoticeEntry[] {
  const policy = readJson<LicencePolicy>(join(root, "tooling/check/licences.json"));
  return (policy.vendored ?? []).map((entry) => ({
    name: `${entry.name} (${entry.path})`,
    versions: [],
    licence: entry.licence,
    source: entry.source,
    texts: [readFileSync(join(root, licenceTextPath(entry.licence)), "utf8")],
  }));
}

const storedTexts = "tooling/check/licence-texts/crates";

function readPolicy(path: string): CrateLicencePolicy {
  const { allow, exceptions } = readDeny(readFileSync(path, "utf8"));
  // An empty list would let nothing through or everything past: neither is safe.
  if (allow === undefined || exceptions === undefined) {
    throw new Error(`${path}: can't read [licenses] allow and exceptions`);
  }
  return { allow, exceptions };
}

/** The crates of every Cargo workspace and target, once each, and what is wrong with them. */
function crateEntries(
  root: string,
  workspaces: readonly string[],
  targets: readonly string[],
): { entries: NoticeEntry[]; problems: string[] } {
  const entries: NoticeEntry[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const workspace of workspaces) {
    const directory = resolve(root, workspace);
    const crates: CargoPackage[] = [];
    for (const target of targets) {
      const output = execFileSync(
        "cargo",
        ["metadata", "--locked", "--format-version", "1", "--filter-platform", target],
        { cwd: directory, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
      );
      for (const pkg of linkedCrates(JSON.parse(output) as CargoMetadata)) {
        if (!seen.has(pkg.id)) {
          seen.add(pkg.id);
          crates.push(pkg);
        }
      }
    }
    const found = cargoNoticeEntries(crates, readPolicy(join(directory, "deny.toml")), {
      list: (folder) => readdirSync(folder),
      read: (path) => readFileSync(path, "utf8"),
      stored: (crate) => {
        const path = join(root, storedTexts, `${crate}.txt`);
        return existsSync(path) ? readFileSync(path, "utf8") : undefined;
      },
    });
    entries.push(...found.entries);
    problems.push(...found.problems);
  }
  return { entries, problems };
}

function main(argv: readonly string[]): number {
  const version = option(argv, "--version");
  const out = option(argv, "--out");
  const name = option(argv, "--name");
  const product = option(argv, "--package");
  const cargo = options(argv, "--cargo");
  const targets = options(argv, "--cargo-target");
  const notices = argv.includes("--notices");
  if (
    name === undefined ||
    version === undefined ||
    out === undefined ||
    (cargo.length > 0 && (!notices || targets.length === 0))
  ) {
    console.error(
      "Usage: pnpm check:sbom --name <product> --version <v> --out <dir> [--package <name>] [--notices [--cargo <dir> --cargo-target <triple>]...]",
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
  const report = (title: string, found: readonly string[]): void => {
    for (const problem of found) {
      console.log(annotate ? `::error title=${title}::${problem}` : `error [${title}] ${problem}`);
    }
  };
  report("sbom", problems);
  console.log(
    `check:sbom: ${problems.length} problem(s) in ${sbom.components?.length ?? 0} component(s), written to ${sbomPath}.`,
  );
  let crateProblems = 0;
  if (notices) {
    const sections: NoticeSection[] = [
      { title: "npm packages", entries: noticeEntries(root, scope) },
    ];
    if (cargo.length > 0) {
      const crates = crateEntries(root, cargo, targets);
      sections.push({ title: "Rust crates", entries: crates.entries });
      report("notices", crates.problems);
      crateProblems = crates.problems.length;
    }
    const vendored = vendoredNotices(root);
    if (vendored.length > 0) {
      sections.push({ title: "Vendored files", entries: vendored });
    }
    writeFileSync(join(out, "THIRD-PARTY-NOTICES.txt"), renderNotices("Halonic", sections));
    console.log(
      `check:sbom: notices for ${sections.map((section) => `${section.entries.length} ${section.title}`).join(" and ")}, ${crateProblems} problem(s).`,
    );
  }
  return problems.length === 0 && crateProblems === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
