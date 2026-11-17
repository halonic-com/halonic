import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { guardDependencyChanged } from "../guard/guard-dependencies.ts";
import { checkGuardedPaths } from "../guard/guarded-paths.ts";
import { runGuard } from "./guard-fixture.ts";

const workspace = (typescript: string, vitest = "^5.1.0"): string => `packages:
  - "packages/*"

catalog:
  "@types/node": ^26.6.6
  "@typescript/typescript6": ${typescript}
  vitest: ${vitest}

onlyBuiltDependencies:
  - esbuild
`;

const lock = (
  version: string,
  old = "6.0.3",
  vitest = "5.1.0",
  oldIntegrity = "aaa",
): string => `lockfileVersion: '9.0'

importers:

  .: {}

  tooling/check:
    devDependencies:
      '@typescript/typescript6':
        specifier: 'catalog:'
        version: ${version}
      vitest:
        specifier: 'catalog:'
        version: ${vitest}(@types/node@26.6.6)

  tooling/config:
    devDependencies:
      '@typescript/typescript6':
        specifier: 'catalog:'
        version: 9.9.9

packages:

  '@typescript/typescript6@${version}':
    resolution: {integrity: sha512-x}
    hasBin: true

  typescript@${old}:
    resolution: {integrity: sha512-${oldIntegrity}}

  vitest@${vitest}:
    resolution: {integrity: sha512-v${vitest}}

snapshots:

  '@typescript/typescript6@${version}':
    dependencies:
      '@typescript/old': typescript@${old}

  typescript@${old}: {}

  vitest@${vitest}(@types/node@26.6.6): {}
`;

verifies("check.guard-dependency", () => {
  test("reports a change to the catalog entry, and nothing else in the catalog", () => {
    const file = "pnpm-workspace.yaml";
    expect(guardDependencyChanged(file, workspace("^6.0.2"), workspace("^6.1.0"))).toBe(true);
    expect(guardDependencyChanged(file, workspace("^6.0.2"), workspace("^6.0.2", "^5.2.0"))).toBe(
      false,
    );
    expect(guardDependencyChanged(file, workspace("^6.0.2"), undefined)).toBe(true);
    expect(guardDependencyChanged(file, undefined, undefined)).toBe(false);
  });

  test("reports a change to the lockfile lines that resolve the dependency", () => {
    const file = "pnpm-lock.yaml";
    const before = lock("6.0.2");
    expect(guardDependencyChanged(file, before, lock("6.0.4"))).toBe(true);
    // Its own dependency, one level down, and that dependency's package entry.
    expect(guardDependencyChanged(file, before, lock("6.0.2", "6.0.4"))).toBe(true);
    expect(guardDependencyChanged(file, before, lock("6.0.2", "6.0.3", "5.1.0", "bbb"))).toBe(true);
  });

  test("follows a dependency whose version has a peer suffix", () => {
    const file = "pnpm-lock.yaml";
    const withPeer = (extra: string): string =>
      `${lock("6.0.3").replace("'@typescript/old': typescript@6.0.3", "peered: 1.2.3(bar@2.0.0)")}\n  peered@1.2.3(bar@2.0.0):\n    dependencies:\n      extra: ${extra}\n`;
    expect(guardDependencyChanged(file, withPeer("1.0.0"), withPeer("1.0.1"))).toBe(true);
    expect(guardDependencyChanged(file, withPeer("1.0.0"), withPeer("1.0.0"))).toBe(false);
  });

  test("ignores other lockfile changes, such as another dev dependency", () => {
    const file = "pnpm-lock.yaml";
    expect(guardDependencyChanged(file, lock("6.0.2"), lock("6.0.2", "6.0.3", "5.2.0"))).toBe(
      false,
    );
    expect(guardDependencyChanged(file, lock("6.0.2"), `${lock("6.0.2")}\n# more\n`)).toBe(false);
  });

  test("counts any change to a lockfile it can't read", () => {
    expect(guardDependencyChanged("pnpm-lock.yaml", "version: 1\n", "version: 2\n")).toBe(true);
  });

  test("counts any change when the importer entry can't be tied to a package block", () => {
    // No `version:` line under the importer entry.
    const noVersion = (integrity: string): string =>
      lock("6.0.2")
        .replace("        version: 6.0.2\n", "")
        .replace("integrity: sha512-x", `integrity: sha512-${integrity}`);
    expect(guardDependencyChanged("pnpm-lock.yaml", noVersion("x"), noVersion("y"))).toBe(true);
    // A version with no matching `packages` or `snapshots` block.
    const orphan = (integrity: string): string =>
      lock("6.0.2")
        .replaceAll("'@typescript/typescript6@6.0.2':", "'@typescript/typescript6@6.0.9':")
        .replace("integrity: sha512-x", `integrity: sha512-${integrity}`);
    expect(guardDependencyChanged("pnpm-lock.yaml", orphan("x"), orphan("y"))).toBe(true);
  });

  test("makes the guard report the file under its own name", async () => {
    const errors = async (head: string): Promise<string[]> =>
      (
        await runGuard({
          base: {},
          head: {},
          checks: [checkGuardedPaths],
          baseOutside: { "pnpm-workspace.yaml": workspace("^6.0.2") },
          headOutside: { "pnpm-workspace.yaml": head },
        })
      ).errors.map((error) => error.replace(/ That needs a decision note: .*$/, ""));
    expect(await errors(workspace("^6.1.0"))).toEqual([
      "pnpm-workspace.yaml: pnpm-workspace.yaml was changed in the entries for the npm package the guard runs, which needs a note that lists pnpm-workspace.yaml.",
    ]);
    expect(await errors(workspace("^6.0.2", "^5.2.0"))).toEqual([]);
  });
});
