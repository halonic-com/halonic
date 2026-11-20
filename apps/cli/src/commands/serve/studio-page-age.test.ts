import { mkdir, mkdtemp, rm, symlink, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { writeFiles } from "../../test/acme-runs.ts";
import { studioPageIsOutdated } from "./studio-page-age.ts";

let root: string;

/** Every file starts at this time; the page is built a minute later. */
const writtenAt = new Date("2026-11-18T13:00:00Z");
const builtAt = new Date("2026-11-18T13:01:00Z");
const changedAt = new Date("2026-11-18T21:05:00Z");

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "halonic-studio-page-age-"));
  // A made-up clone: the app uses the shell, the shell uses the kit; the tools package is used by nobody.
  const files: Record<string, string> = {
    "apps/studio/package.json": manifest({ "@acme/shell": "workspace:*", vite: "8.0.0" }),
    "apps/studio/studio.html": "<title>Halonic</title>",
    "apps/studio/vite.config.ts": "export default {};",
    "apps/studio/src/main.ts": "export {};",
    "apps/studio/src/settings/settings.test.ts": "export {};",
    "apps/studio/dist/studio/studio.html": "<title>Halonic</title>",
    "packages/shell/package.json": manifest({ "@acme/kit": "workspace:*" }),
    "packages/shell/src/shell.ts": "export {};",
    "packages/kit/package.json": manifest({}),
    "packages/kit/src/kit.ts": "export {};",
    "packages/tools/package.json": manifest({}),
    "packages/tools/src/tools.ts": "export {};",
  };
  await writeFiles(root, files);
  for (const path of Object.keys(files)) await utimes(join(root, path), writtenAt, writtenAt);
  await utimes(join(studioFolder(), "studio.html"), builtAt, builtAt);
  // As pnpm links a `workspace:` dependency.
  await link("apps/studio", "@acme/shell", "packages/shell");
  await link("packages/shell", "@acme/kit", "packages/kit");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function manifest(dependencies: Record<string, string>): string {
  return JSON.stringify({ name: "made-up", dependencies });
}

async function link(from: string, name: string, to: string): Promise<void> {
  await mkdir(dirname(join(root, from, "node_modules", name)), { recursive: true });
  await symlink(join(root, to), join(root, from, "node_modules", name), "junction");
}

function studioFolder(): string {
  return join(root, "apps/studio/dist/studio");
}

async function changeLater(path: string): Promise<void> {
  await utimes(join(root, path), changedAt, changedAt);
}

async function outdated(): Promise<boolean> {
  return studioPageIsOutdated(studioFolder(), join(root, "apps/studio"));
}

verifies("cli.commands.serve.studio-page-age", () => {
  it("counts a page built after every source as up to date", async () => {
    expect(await outdated()).toBe(false);
  });

  it("counts the page as older when a file in the app's src changed after it was built", async () => {
    await changeLater("apps/studio/src/main.ts");
    expect(await outdated()).toBe(true);
  });

  it("counts the page as older when the app's studio.html or a package.json changed", async () => {
    await changeLater("apps/studio/studio.html");
    expect(await outdated()).toBe(true);
    await utimes(join(root, "apps/studio/studio.html"), writtenAt, writtenAt);
    await changeLater("packages/shell/package.json");
    expect(await outdated()).toBe(true);
  });

  it("follows the packages the app uses through another one", async () => {
    await changeLater("packages/kit/src/kit.ts");
    expect(await outdated()).toBe(true);
  });

  it("leaves out tests and packages the app doesn't use", async () => {
    await changeLater("apps/studio/src/settings/settings.test.ts");
    await changeLater("packages/tools/src/tools.ts");
    expect(await outdated()).toBe(false);
  });

  it("says nothing when the page isn't built or the app can't be read", async () => {
    await changeLater("apps/studio/src/main.ts");
    await rm(join(studioFolder(), "studio.html"));
    expect(await outdated()).toBe(false);
    expect(await studioPageIsOutdated(studioFolder(), join(root, "missing"))).toBe(false);
  });
});
