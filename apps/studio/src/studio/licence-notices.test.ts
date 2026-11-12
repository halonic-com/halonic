import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { build, type InlineConfig, type Rolldown, type UserConfig } from "vite";
import { afterEach, beforeEach, expect, it } from "vitest";
import viteConfig from "../../vite.config.ts";

// Vitest runs each package's tests from the package folder.
const shellFolder = join(process.cwd(), "src-tauri");

const notice = "/*! @license MPL-2.0 acme-suffixes, https://mozilla.org/MPL/2.0/ */";

let folder = "";

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "studio-licence-"));
  writeFileSync(
    join(folder, "entry.js"),
    `${notice}\n// an ordinary comment\nexport const suffixes = ["acme", "example"];\n`,
  );
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** The app's Vite config for one mode, as `vite build` resolves it. */
function appConfig(mode: string): UserConfig {
  if (typeof viteConfig !== "function") throw new Error("vite.config.ts should export a function");
  return viteConfig({ mode, command: "build", isSsrBuild: false, isPreview: false }) as UserConfig;
}

/** Builds the fixture minified, with the output settings of `config`, and returns the built script. */
async function builtScript(config: UserConfig): Promise<string> {
  const fixture: InlineConfig = {
    configFile: false,
    logLevel: "silent",
    root: folder,
    plugins: [],
    build: {
      write: false,
      minify: true,
      lib: { entry: join(folder, "entry.js"), formats: ["es"], fileName: "entry" },
      // Only the output settings: the app's own pages and plugins aren't part of the fixture.
      rolldownOptions: { output: config.build?.rolldownOptions?.output ?? {} },
    },
  };
  const result = await build(fixture);
  const outputs = (Array.isArray(result) ? result : [result]) as Rolldown.RolldownOutput[];
  const chunk = outputs.flatMap((output) => output.output).find((file) => file.type === "chunk");
  if (chunk === undefined) throw new Error("the build wrote no script");
  return chunk.code;
}

/** The files the Windows installer copies next to the app: source path to installed name. */
function installerResources(): Record<string, string> {
  const config = JSON.parse(
    readFileSync(join(shellFolder, "tauri.installer.conf.json"), "utf8"),
  ) as { bundle?: { resources?: Record<string, string> } };
  return config.bundle?.resources ?? {};
}

verifies("studio.licence-notices", () => {
  it("drops the licence comment when a plain minified build is used, so the check below means something", async () => {
    const code = await builtScript({});
    expect(code).not.toContain("@license MPL-2.0");
  });

  it.each(["studio", "production"])(
    "keeps the licence comment and drops the others in the %s build",
    async (mode) => {
      const code = await builtScript(appConfig(mode));
      expect(code).toContain(notice);
      expect(code).not.toContain("an ordinary comment");
    },
  );

  it("installs the repo's LICENSE and NOTICE next to the app on Windows", () => {
    const resources = installerResources();
    for (const name of ["LICENSE", "NOTICE"]) {
      const source = Object.keys(resources).find((path) => resources[path] === name);
      expect(source, name).toBeDefined();
      expect(resolve(shellFolder, source ?? ""), name).toBe(resolve(process.cwd(), "../..", name));
      expect(existsSync(resolve(shellFolder, source ?? "")), name).toBe(true);
    }
  });
});

verifies("studio.installer-third-party-notices", () => {
  const script = () => readFileSync(join(shellFolder, "windows/build-installer.ps1"), "utf8");

  it("installs THIRD-PARTY-NOTICES.txt from src-tauri/legal next to the app", () => {
    const resources = installerResources();
    const source = Object.keys(resources).find(
      (path) => resources[path] === "THIRD-PARTY-NOTICES.txt",
    );
    expect(source).toBe("legal/THIRD-PARTY-NOTICES.txt");
  });

  it("writes the notices into src-tauri/legal before it builds the installer", () => {
    const text = script();
    expect(text).toContain("$legal = Join-Path $shell 'legal'");
    const sbom = text.indexOf("pnpm check:sbom");
    expect(sbom).toBeGreaterThan(-1);
    const call = text.slice(sbom, text.indexOf("\n", sbom));
    expect(call).toContain("--notices");
    expect(call).toContain("--out $legal");
    expect(call).toContain("--cargo apps/studio/src-tauri --cargo-target $triple");
    expect(sbom).toBeLessThan(text.indexOf("pnpm exec tauri build"));
  });

  it("keeps the generated folder out of git", () => {
    const ignored = readFileSync(resolve(process.cwd(), "../../.gitignore"), "utf8").split("\n");
    expect(ignored).toContain("apps/studio/src-tauri/legal/");
  });
});
