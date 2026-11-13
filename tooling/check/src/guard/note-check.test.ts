import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { approvers, type Files, fakeGit, keyPair } from "../test/signing-fixture.ts";
import type { PullRequest } from "./approvals.ts";
import { policyFile } from "./guarded-paths.ts";
import { checkNotes, trustRoots } from "./note-check.ts";
import {
  approversFile,
  coveredObjects,
  coveredPaths,
  signatureLine,
  signedText,
} from "./signatures.ts";

const julian = keyPair();
const cto = keyPair();
const branch = "julian/HAL-1337-example";
const noteFile = `decisions/${branch}.md`;
const base = "b".repeat(40);
const head = "a".repeat(40);
const pull: PullRequest = { repo: "halonic-com/halonic", number: 7, head, base };
const baseFiles: Files = {
  [approversFile]: approvers({
    internal: [cto.publicKey],
    "user-visible": [cto.publicKey],
    guardians: [cto.publicKey, julian.publicKey],
  }),
  ".github/workflows/ci.yml": "on: pull_request\n",
};

const note = (kind: string, ...covers: string[]) => `# Decision: change CI

- Approval: https://paperclip.example/HAL/issues/HAL-1337
- Kind: ${kind}

The build needs a new step.

## Covers

${covers.map((entry) => `- ${entry}`).join("\n")}
`;

/** Runs the check on a pull request that changes ci.yml and adds `text`, signed by `signer`. */
async function errorsOf(
  text: string | undefined,
  signer: string | readonly string[] = cto.privatePem,
  changedFile = ".github/workflows/ci.yml",
): Promise<string[]> {
  const headFiles = { ...baseFiles, [changedFile]: "on: [pull_request]\n" };
  const git = fakeGit({ [base]: baseFiles, [head]: headFiles });
  const files =
    text === undefined
      ? headFiles
      : {
          ...headFiles,
          [noteFile]: text.replace(
            /(- Kind: .*\n)/,
            `$1${[signer]
              .flat()
              .map((key) => `${sign(text, git, key)}\n`)
              .join("")}`,
          ),
        };
  const report = await checkNotes({
    pull,
    branch,
    changed: [changedFile],
    mergeBase: base,
    git: fakeGit({ [base]: baseFiles, [head]: files }),
  });
  return report.problems.map((problem) => `${problem.file}: ${problem.message}`);
}

function sign(text: string, git: ReturnType<typeof fakeGit>, privatePem: string): string {
  const kind = text.includes("Kind: internal") ? "internal" : "user-visible";
  const covered = [
    ".github",
    ".gitattributes",
    "tooling/check",
    "turbo.json",
    approversFile,
  ].filter((path) =>
    text.split("\n").some((line) => line === `- ${path}` || line === `- ${path}/`),
  );
  const objects = new Map(covered.map((path) => [path, git.objectId(head, path) ?? "missing"]));
  const signed = signedText({ repo: pull.repo, pr: pull.number, kind, unsigned: text, objects });
  return signatureLine(signed, privatePem);
}

const checkRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Loads the static import lines can't show: a dynamic `import(...)`, a `require(...)`
 * or a `createRequire`. Any of them fails, with a literal argument or not, because the
 * test can't follow them. Comments and the text of plain string literals are blanked
 * first, so prose and messages can mention them.
 */
function dynamicLoads(source: string): string[] {
  const code = source.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g,
    " ",
  );
  return [...code.matchAll(/\b(?:import\s*\(|require\s*\(|createRequire\b)/g)].map((m) => m[0]);
}

/**
 * What a guard command reaches: the local files it imports (relative to the repo
 * root) and the packages, with `node:` built-ins left out. With `runtime`,
 * `import type` and `export type` lines are skipped, because Node erases them
 * and loads nothing for them.
 */
function guardImports(
  entry: string,
  runtime = false,
): { files: string[]; packages: string[]; dynamic: string[] } {
  const seen = new Set<string>();
  const dynamic: string[] = [];
  const packages = new Set<string>();
  const stack = [entry];
  for (let file = stack.pop(); file !== undefined; file = stack.pop()) {
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    const source = readFileSync(join(checkRoot, file), "utf8");
    dynamic.push(...dynamicLoads(source).map((load) => `${file}: ${load}`));
    for (const match of source.matchAll(
      /^(?:import|export)\s+(type\s+)?(?:[^;"]*?\sfrom\s+)?"([^"]+)";/gm,
    )) {
      const [, typeOnly, specifier = ""] = match;
      if (typeOnly && runtime) {
        continue;
      }
      if (specifier.startsWith(".")) {
        stack.push(normalize(join(dirname(file), specifier)));
      } else if (!specifier.startsWith("node:")) {
        packages.add(specifier);
      }
    }
  }
  return {
    files: [...seen].map((file) => `tooling/check/${file}`),
    packages: [...packages],
    dynamic,
  };
}

const guardCommands = ["src/cli/guard-notes.ts", "src/cli/requirement-guard.ts"] as const;

verifies("check.guard-notes-own-paths", () => {
  test("fails a change to .github/ without a note, and names the note", async () => {
    expect(await errorsOf(undefined)).toEqual([
      `.github/: Changes the guard's own path .github/. That needs a signed decision note: add ${noteFile} and list ".github/" under Covers.`,
    ]);
  });

  test("passes it with a user-visible note that lists .github/ and the CTO's signature", async () => {
    expect(await errorsOf(note("user-visible", ".github/"))).toEqual([]);
  });

  test("passes .github/ and tooling/check/ with an internal note the CTO signed", async () => {
    expect(await errorsOf(note("internal", ".github/"), cto.privatePem)).toEqual([]);
    expect(
      await errorsOf(note("internal", "tooling/check/"), cto.privatePem, "tooling/check/src/x.ts"),
    ).toEqual([]);
  });

  test("fails an internal note once the change reaches a trust root, or any other own path", async () => {
    const cases: [string, string][] = [
      [".github/", ".github/workflows/guard-notes.yml"],
      ["tooling/check/", "tooling/check/src/guard/approvals.ts"],
      ["tooling/check/", "tooling/check/src/cli/guard-notes.ts"],
      ["tooling/check/", "tooling/check/src/cli/requirement-guard.ts"],
      [approversFile, approversFile],
      ["tooling/check/", "tooling/check/package.json"],
      [".gitattributes", ".gitattributes"],
      ["turbo.json", "turbo.json"],
    ];
    for (const [path, changed] of cases) {
      const errors = await errorsOf(note("internal", path), cto.privatePem, changed);
      expect(errors, changed).toContainEqual(
        expect.stringContaining("so the note's Kind must be user-visible"),
      );
    }
  });

  test("fails a note that doesn't list the path, or whose signature doesn't verify", async () => {
    const unlisted = await errorsOf(note("user-visible", "turbo.json"));
    expect(unlisted[0]).toMatch(/doesn't list "\.github\/" under Covers/);
    const wrongKey = await errorsOf(note("user-visible", ".github/"), julian.privatePem);
    expect(wrongKey).toEqual([
      expect.stringMatching(/approval isn't verified: the key .* isn't in the merge base's/),
    ]);
  });
});

const policy = (extraExports: Record<string, string[]>, published: string[] = []): string =>
  `${JSON.stringify({ coreOrder: ["@halonicjs/std"], published, extraExports }, null, 2)}\n`;

/** Runs the check on a pull request that changes policy.json to `after`, plus `extra` files. */
async function policyErrorsOf(
  after: string,
  text: string | undefined,
  signer: string | readonly string[],
  extra: Files = {},
): Promise<string[]> {
  const before = { ...baseFiles, [policyFile]: policy({}) };
  const headFiles = { ...before, [policyFile]: after, ...extra };
  const files =
    text === undefined ? headFiles : { ...headFiles, [noteFile]: signed(text, headFiles, signer) };
  const report = await checkNotes({
    pull,
    branch,
    changed: [policyFile, ...Object.keys(extra)],
    mergeBase: base,
    git: fakeGit({ [base]: before, [head]: files }),
  });
  return report.problems.map((problem) => `${problem.file}: ${problem.message}`);
}

/** `text` with a signature line over its Covers paths at the head, made with `privatePem`. */
function signed(text: string, headFiles: Files, privatePem: string | readonly string[]): string {
  const git = fakeGit({ [base]: baseFiles, [head]: headFiles });
  const kind = text.includes("Kind: internal") ? "internal" : "user-visible";
  const covers = (text.split("## Covers")[1] ?? "").match(/(?<=^- ).+$/gm) ?? [];
  const objects = coveredObjects(coveredPaths(covers, git, head, base), git, head);
  const facts = { repo: pull.repo, pr: pull.number, kind, unsigned: text, objects } as const;
  const lines = [privatePem].flat().map((pem) => `${signatureLine(signedText(facts), pem)}\n`);
  return text.replace(/(- Kind: .*\n)/, `$1${lines.join("")}`);
}

verifies("check.guard-extra-exports", () => {
  const added = policy({ "@halonicjs/std": ["./error-kind"] });

  test("passes a change to extraExports alone with an internal note the CTO signed", async () => {
    expect(await policyErrorsOf(added, note("internal", policyFile), cto.privatePem)).toEqual([]);
  });

  test("fails it without a note, or with a note that doesn't list policy.json", async () => {
    expect(await policyErrorsOf(added, undefined, cto.privatePem)).toEqual([
      `${policyFile}: Changes extraExports in ${policyFile}. That needs a signed note (internal is enough): add ${noteFile} and list "${policyFile}" under Covers.`,
    ]);
    expect(await policyErrorsOf(added, note("internal", "turbo.json"), cto.privatePem)).toEqual([
      expect.stringContaining(`doesn't list "${policyFile}" under Covers`),
    ]);
  });

  test("counts any other change to policy.json as a change under tooling/check/", async () => {
    const other = policy({ "@halonicjs/std": ["./error-kind"] }, ["@halonicjs/std"]);
    expect(await policyErrorsOf(other, note("internal", policyFile), cto.privatePem)).toEqual([
      `${noteFile}: Changes the guard's own paths (tooling/check/), so the note's Kind must be user-visible.`,
      `${noteFile}: Changes the guard's own path tooling/check/, but the note doesn't list "tooling/check/" under Covers.`,
      expect.stringMatching(/needs 2 different guardians/),
    ]);
    expect(
      await policyErrorsOf(other, note("user-visible", "tooling/check/"), [
        cto.privatePem,
        julian.privatePem,
      ]),
    ).toEqual([]);
  });

  test("counts it under tooling/check/ when another guard file changes with it", async () => {
    const extra = { "tooling/check/src/guard/guard.ts": "export {};\n" };
    const errors = await policyErrorsOf(added, note("internal", policyFile), cto.privatePem, extra);
    expect(errors).toEqual([
      `${noteFile}: Changes the guard's own paths (tooling/check/), so the note's Kind must be user-visible.`,
      `${noteFile}: Changes the guard's own path tooling/check/, but the note doesn't list "tooling/check/" under Covers.`,
      expect.stringMatching(/needs 2 different guardians/),
    ]);
  });

  test("fails an internal note signed by a key other than the CTO's", async () => {
    expect(await policyErrorsOf(added, note("internal", policyFile), julian.privatePem)).toEqual([
      expect.stringMatching(/approval isn't verified/),
    ]);
  });
});

verifies("check.guard-two-guardians", () => {
  test("lists every file the guard commands import as a trust root", () => {
    const covered = (file: string) =>
      trustRoots.some((path) => (path.endsWith("/") ? file.startsWith(path) : file === path));
    for (const command of guardCommands) {
      expect(guardImports(command).files.filter((file) => !covered(file))).toEqual([]);
    }
  });

  test("lets guard-notes load no package, and requirement-guard only the TypeScript parser", () => {
    // guard-notes runs with no install, so any package would fail there.
    expect(guardImports("src/cli/guard-notes.ts", true).packages).toEqual([]);
    expect(guardImports("src/cli/requirement-guard.ts", true).packages).toEqual([
      "@typescript/typescript6",
    ]);
  });

  test("lets the guard commands and the files they load make no dynamic load", () => {
    for (const command of guardCommands) {
      expect(guardImports(command).dynamic).toEqual([]);
    }
  });

  test("sees a dynamic import, a require and a createRequire, literal or not", () => {
    expect(dynamicLoads('const m = await import("x");')).toEqual(["import("]);
    expect(dynamicLoads("const m = await import(name);")).toEqual(["import("]);
    expect(dynamicLoads('const m = require("x");')).toEqual(["require("]);
    expect(dynamicLoads("const m = require(name);")).toEqual(["require("]);
    expect(dynamicLoads('const r = createRequire(import.meta.url);\nr("x");')).toEqual([
      "createRequire",
    ]);
    expect(dynamicLoads('import { createRequire } from "node:module";')).toEqual(["createRequire"]);
  });

  test("leaves static imports, import.meta and comments alone", () => {
    expect(
      dynamicLoads(
        'import { a } from "./a.ts";\nexport { b } from "./b.ts";\nconst u = import.meta.url;\n' +
          "// import(x) and require(y)\n/* createRequire */\nconst k = 1; // require(z)\n",
      ),
    ).toEqual([]);
  });

  test("lists the package.json that pins the parser as a trust root", () => {
    expect(trustRoots).toContain("tooling/check/package.json");
    const manifest = JSON.parse(readFileSync(join(checkRoot, "package.json"), "utf8"));
    expect(Object.keys(manifest.devDependencies)).toContain("@typescript/typescript6");
  });

  const guardianKeys = [cto.privatePem, julian.privatePem];
  const roots = note("user-visible", "tooling/check/");
  const changed = "tooling/check/src/guard/approvals.ts";
  const outsider = keyPair();

  test("passes a trust-root change signed by two different guardians", async () => {
    expect(await errorsOf(roots, guardianKeys, changed)).toEqual([]);
  });

  test("fails one signature, the same key twice, or a key that isn't a guardian", async () => {
    expect(await errorsOf(roots, cto.privatePem, changed)).toEqual([
      expect.stringMatching(/needs 2 different guardians' signatures; it has 1/),
    ]);
    expect(await errorsOf(roots, [cto.privatePem, cto.privatePem], changed)).toEqual([
      expect.stringMatching(/needs 2 different guardians' signatures; it has 1/),
    ]);
    expect(await errorsOf(roots, [cto.privatePem, outsider.privatePem], changed)).toEqual([
      expect.stringMatching(/isn't a guardian in the merge base's/),
    ]);
  });

  test("fails a second guardian who the pull request adds to approvers.json itself", async () => {
    const own = {
      ...baseFiles,
      [approversFile]: approvers({
        internal: [cto.publicKey],
        guardians: [cto.publicKey, outsider.publicKey],
      }),
    };
    const text = roots.replace(/(- Kind: .*\n)/, "$1");
    const unsigned = text;
    const headFiles = { ...own, [changed]: "x\n" };
    const git = fakeGit({ [base]: baseFiles, [head]: headFiles });
    const lines = [cto.privatePem, outsider.privatePem].map(
      (pem) => `${sign(unsigned, git, pem)}\n`,
    );
    const files = {
      ...headFiles,
      [noteFile]: unsigned.replace(/(- Kind: .*\n)/, `$1${lines.join("")}`),
    };
    const report = await checkNotes({
      pull,
      branch,
      changed: [changed, approversFile],
      mergeBase: base,
      git: fakeGit({ [base]: baseFiles, [head]: files }),
    });
    expect(report.problems.map((problem) => problem.message)).toContainEqual(
      expect.stringMatching(/isn't a guardian in the merge base's/),
    );
  });

  test("fails a guardian removed in the same pull request, which still counts at the base", async () => {
    const removed = {
      ...baseFiles,
      [approversFile]: approvers({ internal: [cto.publicKey], guardians: [cto.publicKey] }),
    };
    const headFiles = { ...removed, [changed]: "x\n" };
    const git = fakeGit({ [base]: baseFiles, [head]: headFiles });
    const files = {
      ...headFiles,
      [noteFile]: roots.replace(/(- Kind: .*\n)/, `$1${sign(roots, git, cto.privatePem)}\n`),
    };
    const report = await checkNotes({
      pull,
      branch,
      changed: [changed, approversFile],
      mergeBase: base,
      git: fakeGit({ [base]: baseFiles, [head]: files }),
    });
    expect(report.problems.map((problem) => problem.message)).toContainEqual(
      expect.stringMatching(/needs 2 different guardians' signatures; it has 1/),
    );
  });

  test("fails the signatures replayed on another pull request, or after the note was edited", async () => {
    const headFiles = { ...baseFiles, [changed]: "x\n" };
    const git = fakeGit({ [base]: baseFiles, [head]: headFiles });
    const lines = guardianKeys.map((pem) => `${sign(roots, git, pem)}\n`).join("");
    const run = async (text: string, number: number) =>
      (
        await checkNotes({
          pull: { ...pull, number },
          branch,
          changed: [changed],
          mergeBase: base,
          git: fakeGit({ [base]: baseFiles, [head]: { ...headFiles, [noteFile]: text } }),
        })
      ).problems.map((problem) => problem.message);
    const text = roots.replace(/(- Kind: .*\n)/, `$1${lines}`);
    expect(await run(text, pull.number)).toEqual([]);
    expect(await run(text, 8)).toContainEqual(expect.stringMatching(/doesn't match/));
    expect(await run(text.replace("The build", "The deploy"), pull.number)).toContainEqual(
      expect.stringMatching(/doesn't match/),
    );
  });

  test("needs only the one guardian the base pins when it pins one (the bootstrap)", async () => {
    const one = { ...baseFiles, [approversFile]: approvers({ internal: [cto.publicKey] }) };
    const headFiles = { ...one, [changed]: "x\n" };
    const git = fakeGit({ [base]: one, [head]: headFiles });
    const files = {
      ...headFiles,
      [noteFile]: roots.replace(/(- Kind: .*\n)/, `$1${sign(roots, git, cto.privatePem)}\n`),
    };
    const report = await checkNotes({
      pull,
      branch,
      changed: [changed],
      mergeBase: base,
      git: fakeGit({ [base]: one, [head]: files }),
    });
    expect(report.problems).toEqual([]);
  });
});
