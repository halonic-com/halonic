import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectPayload, isTestFile, payloadManifest } from "./payload.ts";

// A small repo laid out as pnpm installs one: workspace packages linked into
// each other's node_modules, and outside packages in a store folder, where a
// package's own dependencies sit next to it.
let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "agent-host-payload-"));
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

function write(path: string, text: string): void {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

describe("isTestFile", () => {
  it.each([
    "a.test.ts",
    "a.spec.ts",
    "kit.test-helper.ts",
    "a.test-d.ts",
    "test/helper.ts",
    "fixtures/run.json",
    "recording/fixtures/run.json",
    "golden/out.txt",
    "x/__snapshots__/a.snap",
  ])("skips %s", (file) => {
    expect(isTestFile(file)).toBe(true);
  });

  it.each(["main.ts", "commands/test/command.ts", "testing.ts", "specs.ts"])("keeps %s", (file) => {
    expect(isTestFile(file)).toBe(false);
  });
});

function packageJson(path: string, name: string, extra: Record<string, unknown> = {}): void {
  write(path, JSON.stringify({ name, ...extra }));
}

/** Links `node_modules/<name>` in `from` to `to`, as pnpm does. */
function link(from: string, name: string, to: string): void {
  const at = join(repo, from, "node_modules", name);
  mkdirSync(dirname(at), { recursive: true });
  // A junction on Windows, so the test needs no administrator rights.
  symlinkSync(join(repo, to), at, "junction");
}

/** The host depends on one workspace package, which depends on one outside package with a dependency of its own. */
function typicalRepo(): void {
  packageJson("apps/agent-host/package.json", "@halonicjs/app-agent-host", {
    dependencies: { "@halonicjs/ports": "workspace:*" },
    devDependencies: { vitest: "1" },
  });
  write("apps/agent-host/src/main.ts", "main");
  write("apps/agent-host/src/main.test.ts", "test");
  write("apps/agent-host/src/build/payload.ts", "build");
  packageJson("packages/core/ports/package.json", "@halonicjs/ports", {
    dependencies: { "@scope/srt": "1.0.0" },
  });
  write("packages/core/ports/src/index.ts", "ports");
  write("packages/core/ports/src/kit.test-helper.ts", "helper");
  write("packages/core/ports/README.md", "not runtime");
  link("apps/agent-host", "@halonicjs/ports", "packages/core/ports");
  const store = ".pnpm/srt@1.0.0/node_modules";
  packageJson(`${store}/@scope/srt/package.json`, "@scope/srt", {
    dependencies: { zod: "3" },
    optionalDependencies: { "not-installed": "1" },
  });
  write(`${store}/@scope/srt/dist/cli.js`, "cli");
  write(`${store}/@scope/srt/dist/cli.js.map`, "map");
  write(`${store}/@scope/srt/dist/cli.d.ts`, "types");
  write(`${store}/@scope/srt/vendor/seccomp/x64/apply-seccomp`, "program");
  write(`${store}/@scope/srt/node_modules/.bin/srt`, "shim");
  packageJson(`${store}/zod/package.json`, "zod");
  write(`${store}/zod/index.js`, "zod");
  link("packages/core/ports", "@scope/srt", `${store}/@scope/srt`);
}

describe("collectPayload", () => {
  it("collects the host, its workspace packages at their place, and outside packages under node_modules", () => {
    typicalRepo();
    const payload = collectPayload(join(repo, "apps/agent-host"), repo);
    expect(payload.files.map((file) => file.path)).toEqual([
      "apps/agent-host/package.json",
      "apps/agent-host/src/main.ts",
      "node_modules/@scope/srt/dist/cli.js",
      "node_modules/@scope/srt/package.json",
      "node_modules/@scope/srt/vendor/seccomp/x64/apply-seccomp",
      "node_modules/zod/index.js",
      "node_modules/zod/package.json",
      "packages/core/ports/package.json",
      "packages/core/ports/src/index.ts",
    ]);
    expect(payload.packages).toEqual({
      "@halonicjs/app-agent-host": "apps/agent-host",
      "@halonicjs/ports": "packages/core/ports",
    });
  });

  it.skipIf(process.platform === "win32")(
    "[platform:win32] Windows has no executable file mode: marks the files anyone may run",
    () => {
      typicalRepo();
      const program = ".pnpm/srt@1.0.0/node_modules/@scope/srt/vendor/seccomp/x64/apply-seccomp";
      chmodSync(join(repo, program), 0o755);
      const payload = collectPayload(join(repo, "apps/agent-host"), repo);
      const executable = payload.files.filter((file) => file.executable).map((file) => file.path);
      expect(executable).toEqual(["node_modules/@scope/srt/vendor/seccomp/x64/apply-seccomp"]);
    },
  );

  it("points each file at its real place on disk", () => {
    typicalRepo();
    const payload = collectPayload(join(repo, "apps/agent-host"), repo);
    const zod = payload.files.find((file) => file.path === "node_modules/zod/index.js");
    expect(zod?.source).toContain(join(".pnpm", "srt@1.0.0", "node_modules", "zod", "index.js"));
  });

  it("refuses a dependency that isn't installed", () => {
    packageJson("apps/agent-host/package.json", "@halonicjs/app-agent-host", {
      dependencies: { missing: "1" },
    });
    expect(() => collectPayload(join(repo, "apps/agent-host"), repo)).toThrow(
      "missing, which @halonicjs/app-agent-host depends on, isn't installed. Run pnpm install.",
    );
  });

  it("refuses two copies of one outside package", () => {
    packageJson("apps/agent-host/package.json", "@halonicjs/app-agent-host", {
      dependencies: { a: "1", b: "1" },
    });
    packageJson("store/a/node_modules/a/package.json", "a", { dependencies: { zod: "3" } });
    packageJson("store/a/node_modules/zod/package.json", "zod");
    packageJson("store/b/node_modules/b/package.json", "b", { dependencies: { zod: "4" } });
    packageJson("store/b/node_modules/zod/package.json", "zod");
    link("apps/agent-host", "a", "store/a/node_modules/a");
    link("apps/agent-host", "b", "store/b/node_modules/b");
    expect(() => collectPayload(join(repo, "apps/agent-host"), repo)).toThrow(
      /needs two copies of zod/,
    );
  });
});

describe("payloadManifest", () => {
  const payload = {
    files: [
      { path: "a/one.js", source: "one", executable: false },
      { path: "a/two.js", source: "two", executable: true },
    ],
    packages: { "@halonicjs/a": "a" },
  };
  const bytes = (text: string) => new TextEncoder().encode(text);
  const use = { entry: "a/one.js", programs: ["a/two.js"] };

  it("gives each file's digest and size, and keeps the packages", () => {
    const manifest = payloadManifest(payload, use, (source) => bytes(source));
    expect(manifest.files).toEqual([
      {
        path: "a/one.js",
        sha256: "7692c3ad3540bb803c020b3aee66cd8887123234ea0c6e7143c0add73ff431ed",
        size: 3,
        executable: false,
      },
      {
        path: "a/two.js",
        sha256: "3fc4ccfe745870e2c0d99f71f30ff0656c8dedd41cc1d7d3d376b0dbe685e2f3",
        size: 3,
        executable: true,
      },
    ]);
    expect(manifest).toMatchObject({ ...use, packages: { "@halonicjs/a": "a" } });
  });

  it("refuses an entry or a program that isn't in the payload", () => {
    expect(() => payloadManifest(payload, { entry: "a/one.js", programs: ["b/cli.js"] })).toThrow(
      "The payload has no b/cli.js.",
    );
  });

  it("has a digest that changes when any file changes", () => {
    const before = payloadManifest(payload, use, (source) => bytes(source)).digest;
    const after = payloadManifest(payload, use, (source) => bytes(`${source}!`)).digest;
    expect(before).toMatch(/^[0-9a-f]{64}$/);
    expect(after).not.toBe(before);
  });
});
